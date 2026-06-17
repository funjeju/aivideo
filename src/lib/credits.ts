import crypto from "node:crypto";
import { adminDb } from "./firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { getTier, type TierId } from "./pricing";

/**
 * 구독 결제용 멱등 paymentId. 같은 (uid, period)면 항상 동일 → 같은 달 중복청구 방지.
 * 이니시스 oid 길이 제한(≤40) 때문에 uid를 짧은 해시로 축약. 형식: sub_{12hex}_{period} (24자).
 */
export function subscriptionPaymentId(uid: string, period: string): string {
  const h = crypto.createHash("sha256").update(uid).digest("hex").slice(0, 12);
  return `sub_${h}_${period}`;
}

/**
 * 크레딧 원장(ledger) + 선차감(hold)/환불(refund) + 구독 월충전(grant).
 *
 * 원칙(09-pricing.md §4):
 * - 선차감: 생성 승인 시 예상 크레딧을 즉시 차감(hold). 잔액 부족이면 거절.
 *   → 동시 실행(멀티큐)에도 잔액 초과 불가(원자적 트랜잭션).
 * - 실패 시 환불(refund): 차감분을 되돌린다.
 * - 모든 증감은 users/{uid}/ledger 에 1건씩 기록(감사·정산용).
 * - 차감은 항상 FieldValue.increment 로 원자적.
 */

export type LedgerType = "grant" | "hold" | "refund" | "charge" | "adjust";

export interface LedgerEntry {
  type: LedgerType;
  amount: number;        // +적립 / -차감
  balanceAfter: number;
  ref?: string;          // 관련 리소스(projectId, billing txId 등)
  note?: string;
  createdAt: FirebaseFirestore.FieldValue;
}

function userRef(uid: string) {
  return adminDb().collection("users").doc(uid);
}
function ledgerCol(uid: string) {
  return userRef(uid).collection("ledger");
}

/**
 * 선차감(hold). 트랜잭션으로 잔액 확인 후 차감 + 원장 기록.
 * @returns { ok, balance } — ok=false면 잔액 부족(차감 안 함).
 */
export async function holdCredits(
  uid: string,
  amount: number,
  ref: string,
  note?: string,
): Promise<{ ok: boolean; balance: number }> {
  if (amount <= 0) {
    const cur = (await userRef(uid).get()).data()?.credits ?? 0;
    return { ok: true, balance: cur };
  }
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    const credits = (snap.data()?.credits as number) ?? 0;
    if (credits < amount) return { ok: false, balance: credits };
    const balanceAfter = credits - amount;
    tx.update(userRef(uid), { credits: FieldValue.increment(-amount) });
    tx.set(ledgerCol(uid).doc(), {
      type: "hold", amount: -amount, balanceAfter, ref, note: note ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, balance: balanceAfter };
  });
}

/** 환불(refund). hold 했던 크레딧을 되돌린다(생성 실패 등). */
export async function refundCredits(uid: string, amount: number, ref: string, note?: string): Promise<void> {
  if (amount <= 0) return;
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    const credits = (snap.data()?.credits as number) ?? 0;
    tx.update(userRef(uid), { credits: FieldValue.increment(amount) });
    tx.set(ledgerCol(uid).doc(), {
      type: "refund", amount, balanceAfter: credits + amount, ref, note: note ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/** 적립(grant). 구독 월충전·관리자 지급·충전팩 등. */
export async function grantCredits(uid: string, amount: number, ref: string, note?: string): Promise<void> {
  if (amount <= 0) return;
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    const credits = (snap.data()?.credits as number) ?? 0;
    tx.update(userRef(uid), { credits: FieldValue.increment(amount) });
    tx.set(ledgerCol(uid).doc(), {
      type: "grant", amount, balanceAfter: credits + amount, ref, note: note ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

export interface Subscription {
  tier: TierId;
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd: number;   // epoch ms — 이 시점까지 유효(갱신/해지 기준)
  billingKey?: string;        // 포트원 빌링키(정기결제). 없으면 수동/관리자 부여.
  lastGrantedPeriod?: string; // 'YYYY-MM' 등 — 같은 주기 중복충전 방지
}

/**
 * 구독 부여/갱신 + 해당 주기 포함 크레딧 충전(중복 방지).
 * PG 웹훅(결제 성공)·관리자 수동 부여 양쪽에서 호출.
 * @param period 충전 주기 키(예 '2026-06'). 같은 period면 재충전 스킵.
 */
export async function activateSubscription(
  uid: string,
  tier: TierId,
  currentPeriodEnd: number,
  period: string,
  opts?: { billingKey?: string; note?: string },
): Promise<{ granted: number }> {
  const spec = getTier(tier);
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    const data = snap.data() ?? {};
    const sub = (data.subscription as Subscription | undefined) ?? undefined;
    const already = sub?.lastGrantedPeriod === period && sub?.tier === tier;

    const nextSub: Subscription = {
      tier,
      status: "active",
      currentPeriodEnd,
      billingKey: opts?.billingKey ?? sub?.billingKey,
      lastGrantedPeriod: period,
    };
    tx.update(userRef(uid), { subscription: nextSub, plan: tier });

    if (!already && spec.monthlyCredits > 0) {
      const credits = (data.credits as number) ?? 0;
      tx.update(userRef(uid), { credits: FieldValue.increment(spec.monthlyCredits) });
      tx.set(ledgerCol(uid).doc(), {
        type: "grant", amount: spec.monthlyCredits, balanceAfter: credits + spec.monthlyCredits,
        ref: `sub:${tier}:${period}`, note: opts?.note ?? "구독 충전",
        createdAt: FieldValue.serverTimestamp(),
      });
      return { granted: spec.monthlyCredits };
    }
    return { granted: 0 };
  });
}

/** 관리자 수동 크레딧 조정(+부여/-회수). 원장에 'adjust'로 기록. */
export async function adminAdjustCredits(uid: string, delta: number, note?: string): Promise<{ balance: number }> {
  if (delta === 0) {
    const cur = (await userRef(uid).get()).data()?.credits ?? 0;
    return { balance: cur };
  }
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    const credits = (snap.data()?.credits as number) ?? 0;
    const balanceAfter = Math.max(0, credits + delta);
    tx.update(userRef(uid), { credits: FieldValue.increment(balanceAfter - credits) });
    tx.set(ledgerCol(uid).doc(), {
      type: "adjust", amount: balanceAfter - credits, balanceAfter,
      ref: "admin", note: note ?? "관리자 조정", createdAt: FieldValue.serverTimestamp(),
    });
    return { balance: balanceAfter };
  });
}

/** 구독 해지(현재 주기까지는 유효, 다음 갱신 없음). */
export async function cancelSubscription(uid: string): Promise<void> {
  const snap = await userRef(uid).get();
  const sub = snap.data()?.subscription as Subscription | undefined;
  if (!sub) return;
  await userRef(uid).update({ "subscription.status": "canceled" });
}
