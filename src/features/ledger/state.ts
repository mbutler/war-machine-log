import type {
  LedgerCategory,
  LedgerRecurringExpense,
  LedgerSource,
  LedgerState,
  LedgerTransaction,
} from "../../state/schema";
import { getState, subscribe, updateState } from "../../state/store";
import { createId } from "../../utils/id";
import { subscribeToCalendar } from "../calendar/state";

export type LedgerListener = (state: LedgerState) => void;

const MAX_TRANSACTIONS = 500;

// ============================================================================
// State Access
// ============================================================================

export function getLedgerState(): LedgerState {
  return getState().ledger;
}

export function subscribeToLedger(listener: LedgerListener): () => void {
  return subscribe((state) => listener(state.ledger));
}

export function getLedgerBalance(): number {
  return getState().ledger.balance;
}

// ============================================================================
// Transaction Recording
// ============================================================================

export interface RecordTransactionOptions {
  source: LedgerSource;
  category: LedgerCategory;
  amount: number;
  description: string;
  linkedEntityId?: string;
  linkedEntityType?: string;
}

/**
 * Record a gold transaction. Positive amount = income, negative = expense.
 * Automatically updates the running balance and links to calendar time.
 */
export function recordTransaction(options: RecordTransactionOptions): LedgerTransaction {
  const {
    source,
    category,
    amount,
    description,
    linkedEntityId,
    linkedEntityType,
  } = options;

  let transaction: LedgerTransaction | null = null;

  updateState((state) => {
    const calendar = state.calendar.clock;
    const newBalance = state.ledger.balance + amount;

    const entry: LedgerTransaction = {
      id: createId(),
      timestamp: Date.now(),
      calendarYear: calendar.year,
      calendarMonth: calendar.month,
      calendarDay: calendar.day,
      source,
      category,
      amount,
      balance: newBalance,
      description,
      linkedEntityId,
      linkedEntityType,
    };

    state.ledger.balance = newBalance;
    state.ledger.transactions.unshift(entry);
    state.ledger.transactions = state.ledger.transactions.slice(0, MAX_TRANSACTIONS);

    transaction = entry;
  });

  return transaction!;
}

/**
 * Record income (positive gold flow)
 */
export function recordIncome(
  amount: number,
  source: LedgerSource,
  category: LedgerCategory,
  description: string,
  options?: { linkedEntityId?: string; linkedEntityType?: string },
): LedgerTransaction {
  return recordTransaction({
    source,
    category,
    amount: Math.abs(amount),
    description,
    ...options,
  });
}

/**
 * Record expense (negative gold flow)
 */
export function recordExpense(
  amount: number,
  source: LedgerSource,
  category: LedgerCategory,
  description: string,
  options?: { linkedEntityId?: string; linkedEntityType?: string },
): LedgerTransaction {
  return recordTransaction({
    source,
    category,
    amount: -Math.abs(amount),
    description,
    ...options,
  });
}

// ============================================================================
// Convenience Functions for Common Transactions
// ============================================================================

/**
 * Record loot from dungeon/wilderness encounters
 */
export function recordLoot(amount: number, description: string, source: LedgerSource = "dungeon"): LedgerTransaction {
  return recordIncome(amount, source, "loot", description);
}

/**
 * Record dominion tax income
 */
export function recordTaxIncome(amount: number, season: string): LedgerTransaction {
  return recordIncome(amount, "dominion", "tax", `Tax revenue: ${season}`);
}

/**
 * Record merchant trade profit/loss
 */
export function recordTradeProfit(amount: number, goodName: string, journeyId?: string): LedgerTransaction {
  const isProfit = amount >= 0;
  return recordTransaction({
    source: "merchant",
    category: "trade",
    amount,
    description: isProfit ? `Trade profit: ${goodName}` : `Trade loss: ${goodName}`,
    linkedEntityId: journeyId,
    linkedEntityType: "merchant_journey",
  });
}

/**
 * Record equipment purchase
 */
export function recordEquipmentPurchase(cost: number, itemName: string, quantity = 1): LedgerTransaction {
  const desc = quantity > 1 ? `Purchased ${quantity}x ${itemName}` : `Purchased ${itemName}`;
  return recordExpense(cost, "party", "equipment", desc);
}

/**
 * Record equipment sale
 */
export function recordEquipmentSale(value: number, itemName: string, quantity = 1): LedgerTransaction {
  const desc = quantity > 1 ? `Sold ${quantity}x ${itemName}` : `Sold ${itemName}`;
  return recordIncome(value, "party", "equipment", desc);
}

/**
 * Record stronghold construction payment
 */
export function recordConstructionPayment(cost: number, projectName: string, projectId?: string): LedgerTransaction {
  return recordExpense(cost, "stronghold", "construction", `Construction: ${projectName}`, {
    linkedEntityId: projectId,
    linkedEntityType: "stronghold_project",
  });
}

/**
 * Record magic item research/creation cost
 */
export function recordResearchCost(cost: number, itemDescription: string): LedgerTransaction {
  return recordExpense(cost, "lab", "research", `Research: ${itemDescription}`);
}

/**
 * Record retainer/hireling wage payment
 */
export function recordWagePayment(amount: number, retainerName: string, retainerId?: string): LedgerTransaction {
  return recordExpense(amount, "party", "wage", `Wages: ${retainerName}`, {
    linkedEntityId: retainerId,
    linkedEntityType: "retainer",
  });
}

/**
 * Record supply purchase (rations, torches, etc.)
 */
export function recordSupplyPurchase(cost: number, supplyDescription: string): LedgerTransaction {
  return recordExpense(cost, "party", "supplies", `Supplies: ${supplyDescription}`);
}

/**
 * Record tithe/donation
 */
export function recordTithe(amount: number, description: string): LedgerTransaction {
  return recordExpense(amount, "dominion", "tithe", description);
}

/**
 * Record manual adjustment (DM fiat, corrections, etc.)
 */
export function recordManualAdjustment(amount: number, description: string): LedgerTransaction {
  return recordTransaction({
    source: "manual",
    category: "misc",
    amount,
    description,
  });
}

// ============================================================================
// Balance Management
// ============================================================================

/**
 * Set balance directly (use sparingly - prefer recordTransaction)
 */
export function setLedgerBalance(balance: number) {
  updateState((state) => {
    const diff = balance - state.ledger.balance;
    if (diff !== 0) {
      const calendar = state.calendar.clock;
      state.ledger.transactions.unshift({
        id: createId(),
        timestamp: Date.now(),
        calendarYear: calendar.year,
        calendarMonth: calendar.month,
        calendarDay: calendar.day,
        source: "manual",
        category: "misc",
        amount: diff,
        balance: balance,
        description: "Balance adjustment",
      });
      state.ledger.transactions = state.ledger.transactions.slice(0, MAX_TRANSACTIONS);
    }
    state.ledger.balance = balance;
  });
}

/**
 * Check if there's enough gold for a purchase
 */
export function canAfford(cost: number): boolean {
  return getLedgerBalance() >= cost;
}

// ============================================================================
// Recurring Expenses
// ============================================================================

export interface AddRecurringExpenseOptions {
  name: string;
  amount: number;
  frequency: LedgerRecurringExpense["frequency"];
  source: LedgerSource;
  category: LedgerCategory;
  linkedEntityId?: string;
  linkedEntityType?: string;
}

/**
 * Add a recurring expense (e.g., retainer wages)
 */
export function addRecurringExpense(options: AddRecurringExpenseOptions): LedgerRecurringExpense {
  let expense: LedgerRecurringExpense | null = null;

  updateState((state) => {
    const calendar = state.calendar.clock;
    const { nextYear, nextMonth, nextDay } = calculateNextDueDate(
      calendar.year,
      calendar.month,
      calendar.day,
      options.frequency,
    );

    const entry: LedgerRecurringExpense = {
      id: createId(),
      name: options.name,
      amount: options.amount,
      frequency: options.frequency,
      source: options.source,
      category: options.category,
      nextDueYear: nextYear,
      nextDueMonth: nextMonth,
      nextDueDay: nextDay,
      active: true,
      linkedEntityId: options.linkedEntityId,
      linkedEntityType: options.linkedEntityType,
    };

    state.ledger.recurringExpenses.push(entry);
    expense = entry;
  });

  return expense!;
}

/**
 * Remove a recurring expense
 */
export function removeRecurringExpense(id: string) {
  updateState((state) => {
    state.ledger.recurringExpenses = state.ledger.recurringExpenses.filter((e) => e.id !== id);
  });
}

/**
 * Toggle a recurring expense active/inactive
 */
export function toggleRecurringExpense(id: string, active: boolean) {
  updateState((state) => {
    const expense = state.ledger.recurringExpenses.find((e) => e.id === id);
    if (expense) {
      expense.active = active;
    }
  });
}

/**
 * Process due recurring expenses (call when calendar advances)
 */
export function processRecurringExpenses(): LedgerTransaction[] {
  const processed: LedgerTransaction[] = [];

  updateState((state) => {
    const calendar = state.calendar.clock;

    state.ledger.recurringExpenses.forEach((expense) => {
      if (!expense.active) return;

      // Check if expense is due
      if (isExpenseDue(expense, calendar.year, calendar.month, calendar.day)) {
        // Record the expense
        const newBalance = state.ledger.balance - expense.amount;
        const transaction: LedgerTransaction = {
          id: createId(),
          timestamp: Date.now(),
          calendarYear: calendar.year,
          calendarMonth: calendar.month,
          calendarDay: calendar.day,
          source: expense.source,
          category: expense.category,
          amount: -expense.amount,
          balance: newBalance,
          description: `Recurring: ${expense.name}`,
          linkedEntityId: expense.linkedEntityId,
          linkedEntityType: expense.linkedEntityType,
        };

        state.ledger.balance = newBalance;
        state.ledger.transactions.unshift(transaction);
        processed.push(transaction);

        // Calculate next due date
        const { nextYear, nextMonth, nextDay } = calculateNextDueDate(
          calendar.year,
          calendar.month,
          calendar.day,
          expense.frequency,
        );
        expense.nextDueYear = nextYear;
        expense.nextDueMonth = nextMonth;
        expense.nextDueDay = nextDay;
      }
    });

    state.ledger.transactions = state.ledger.transactions.slice(0, MAX_TRANSACTIONS);
  });

  return processed;
}

function isExpenseDue(expense: LedgerRecurringExpense, year: number, month: number, day: number): boolean {
  if (year > expense.nextDueYear) return true;
  if (year === expense.nextDueYear && month > expense.nextDueMonth) return true;
  if (year === expense.nextDueYear && month === expense.nextDueMonth && day >= expense.nextDueDay) return true;
  return false;
}

function calculateNextDueDate(
  year: number,
  month: number,
  day: number,
  frequency: LedgerRecurringExpense["frequency"],
): { nextYear: number; nextMonth: number; nextDay: number } {
  const DAYS_PER_MONTH = 28;
  const MONTHS_PER_YEAR = 12;

  let nextYear = year;
  let nextMonth = month;
  let nextDay = day;

  switch (frequency) {
    case "daily":
      nextDay += 1;
      break;
    case "weekly":
      nextDay += 7;
      break;
    case "monthly":
      nextMonth += 1;
      break;
    case "seasonal":
      nextMonth += 3;
      break;
  }

  // Normalize dates
  while (nextDay > DAYS_PER_MONTH) {
    nextDay -= DAYS_PER_MONTH;
    nextMonth += 1;
  }
  while (nextMonth >= MONTHS_PER_YEAR) {
    nextMonth -= MONTHS_PER_YEAR;
    nextYear += 1;
  }

  return { nextYear, nextMonth, nextDay };
}

// ============================================================================
// Transaction Queries
// ============================================================================

/**
 * Get transactions filtered by source
 */
export function getTransactionsBySource(source: LedgerSource): LedgerTransaction[] {
  return getLedgerState().transactions.filter((t) => t.source === source);
}

/**
 * Get transactions filtered by category
 */
export function getTransactionsByCategory(category: LedgerCategory): LedgerTransaction[] {
  return getLedgerState().transactions.filter((t) => t.category === category);
}

/**
 * Get income total for a given time period (in-game calendar)
 */
export function getIncomeForPeriod(startYear: number, startMonth: number, endYear: number, endMonth: number): number {
  return getLedgerState()
    .transactions.filter((t) => {
      const afterStart = t.calendarYear > startYear || (t.calendarYear === startYear && t.calendarMonth >= startMonth);
      const beforeEnd = t.calendarYear < endYear || (t.calendarYear === endYear && t.calendarMonth <= endMonth);
      return afterStart && beforeEnd && t.amount > 0;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Get expense total for a given time period (in-game calendar)
 */
export function getExpensesForPeriod(startYear: number, startMonth: number, endYear: number, endMonth: number): number {
  return Math.abs(
    getLedgerState()
      .transactions.filter((t) => {
        const afterStart = t.calendarYear > startYear || (t.calendarYear === startYear && t.calendarMonth >= startMonth);
        const beforeEnd = t.calendarYear < endYear || (t.calendarYear === endYear && t.calendarMonth <= endMonth);
        return afterStart && beforeEnd && t.amount < 0;
      })
      .reduce((sum, t) => sum + t.amount, 0),
  );
}

// ============================================================================
// Data Export/Import
// ============================================================================

export function exportLedgerData() {
  const state = getLedgerState();
  return {
    exportedAt: new Date().toISOString(),
    balance: state.balance,
    transactions: state.transactions,
    recurringExpenses: state.recurringExpenses,
  };
}

export function importLedgerData(raw: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Ledger import payload must be an object.");
  }

  const data = payload as {
    balance?: number;
    transactions?: LedgerTransaction[];
    recurringExpenses?: LedgerRecurringExpense[];
  };

  updateState((state) => {
    if (typeof data.balance === "number") {
      state.ledger.balance = data.balance;
    }
    if (Array.isArray(data.transactions)) {
      state.ledger.transactions = data.transactions.slice(0, MAX_TRANSACTIONS);
    }
    if (Array.isArray(data.recurringExpenses)) {
      state.ledger.recurringExpenses = data.recurringExpenses;
    }
  });
}

export function clearLedgerTransactions() {
  updateState((state) => {
    state.ledger.transactions = [];
  });
}

// ============================================================================
// Calendar Integration - Auto-process recurring expenses when time advances
// ============================================================================

let lastProcessedDate = { year: 0, month: 0, day: 0 };

subscribeToCalendar((calendarState) => {
  const { year, month, day } = calendarState.clock;

  // Only process if the date has actually changed
  if (
    year === lastProcessedDate.year &&
    month === lastProcessedDate.month &&
    day === lastProcessedDate.day
  ) {
    return;
  }

  // Update last processed date
  lastProcessedDate = { year, month, day };

  // Process any due recurring expenses
  const processed = processRecurringExpenses();
  if (processed.length > 0) {
    console.log(`[Ledger] Processed ${processed.length} recurring expense(s)`);
  }
});

