import type { AlertSeverity, RiskLevel, SignalType, TelegramAlertResult, TelegramPayload } from '../types/domain';

import axios from 'axios';
import errorUtils = require('../utils/error');
import runtimeStatus = require('./runtimeStatus');
import { allowedOrigins } from '../config/env';

const { getErrorMessage } = errorUtils;
const { recordTelegramMessage } = runtimeStatus;

interface ReplyMarkup {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
}

interface LiquidationAlertInput {
  symbol: string;
  leverage: number;
  riskLevel: RiskLevel;
  riskScore: number;
  distancePct: number;
  macroThreat: string;
  claudeMemo: string;
}

interface NarrativeSignalInput {
  sector: string;
  signal: SignalType;
  combinedScore: number;
  narrativeScore: number;
  etfScore: number;
  macroScore: number;
  topHeadline: string;
  reasoning: string;
  lifecycleStage?: string;
  confidence?: number;
  velocityScore?: number;
  crowdingScore?: number;
  marketConfirmationScore?: number;
  catalyst?: string;
}

interface MacroWarningInput {
  eventName: string;
  hoursUntil: number;
  historicalAvgMove: number;
  affectedPositions: Array<{ symbol: string; leverage: string | number | null | undefined }>;
}

interface DailySummaryInput {
  topSignal: string;
  positionsMonitored: number;
  alertsSent: number;
  claudeMemo: string;
}

function getApiBase(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? `https://api.telegram.org/bot${token}` : null;
}

function getChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || allowedOrigins()[0] || 'http://localhost:3000';
}

function getSeverityFromSignal(signal: SignalType): AlertSeverity {
  if (signal === 'STRONG_BUY' || signal === 'BUY') return 'INFO';
  if (signal === 'WATCH' || signal === 'NEUTRAL') return 'WARNING';
  return 'DANGER';
}

function timestamp(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

const telegram = {
  async sendMessage(text: string, replyMarkup: ReplyMarkup | null = null): Promise<boolean> {
    const apiBase = getApiBase();
    const chatId = getChatId();

    if (!apiBase || !chatId) {
      console.warn('[Telegram] Skipping message; TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.');
      return false;
    }

    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    try {
      await axios.post(`${apiBase}/sendMessage`, body, { timeout: 10_000 });
      recordTelegramMessage();
      return true;
    } catch (error) {
      console.error(`[Telegram] Failed to send: ${getErrorMessage(error)}`);
      return false;
    }
  },

  dashboardButton(path = '/dashboard'): ReplyMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: 'Open Dashboard to Act',
            url: `${getAppUrl()}${path}`
          }
        ]
      ]
    };
  },

  buildLiquidationAlert({
    symbol,
    leverage,
    riskLevel,
    riskScore,
    distancePct,
    macroThreat,
    claudeMemo
  }: LiquidationAlertInput): TelegramAlertResult {
    return {
      alertType: 'LIQUIDATION_RISK',
      severity: riskLevel === 'CRITICAL' ? 'CRITICAL' : riskLevel === 'DANGER' ? 'DANGER' : 'WARNING',
      title: `${riskLevel} liquidation risk on ${symbol}`,
      message: [
        `SENTINEL SHIELD - ${riskLevel}`,
        '',
        `Position: ${symbol}`,
        `Leverage: ${leverage}x`,
        `Risk Score: ${riskScore}/100`,
        `Distance to Liquidation: ${distancePct.toFixed(2)}%`,
        `Macro Threat: ${macroThreat}`,
        '',
        'Claude Analysis:',
        claudeMemo,
        '',
        'Open the dashboard to review and act.',
        '',
        `Sentinel Finance | ${timestamp()}`
      ].join('\n')
    };
  },

  async sendLiquidationAlert(input: LiquidationAlertInput): Promise<TelegramAlertResult> {
    const payload = this.buildLiquidationAlert(input);
    const telegramSent = await this.sendMessage(payload.message, this.dashboardButton('/dashboard'));
    return { ...payload, telegramSent };
  },

  buildNarrativeSignal({
    sector,
    signal,
    combinedScore,
    narrativeScore,
    etfScore,
    macroScore,
    topHeadline,
    reasoning,
    lifecycleStage,
    confidence,
    velocityScore,
    crowdingScore,
    marketConfirmationScore,
    catalyst
  }: NarrativeSignalInput): TelegramAlertResult {
    return {
      alertType: 'NARRATIVE_SIGNAL',
      severity: getSeverityFromSignal(signal),
      title: `${lifecycleStage || signal} narrative for ${sector}`,
      message: [
        `NARRATIVE RADAR - ${lifecycleStage || signal}`,
        '',
        `Sector: ${sector}`,
        `Combined Score: ${combinedScore}/100`,
        `Confidence: ${confidence ?? narrativeScore}/100`,
        `Velocity: ${velocityScore ?? narrativeScore}/100`,
        `Market Confirmation: ${marketConfirmationScore ?? 50}/100`,
        `Crowding: ${crowdingScore ?? 0}/100`,
        `Global Context: ETF ${etfScore}/100 | Macro ${macroScore}/100`,
        `Catalyst: ${catalyst || 'Organic attention'}`,
        '',
        'Headline:',
        topHeadline,
        '',
        'Claude Take:',
        reasoning,
        '',
        'Open the dashboard to view the full signal.',
        '',
        `Sentinel Finance | ${timestamp()}`
      ].join('\n')
    };
  },

  async sendNarrativeSignal(input: NarrativeSignalInput): Promise<TelegramAlertResult> {
    const payload = this.buildNarrativeSignal(input);
    const telegramSent = await this.sendMessage(payload.message, this.dashboardButton('/dashboard'));
    return { ...payload, telegramSent };
  },

  buildMacroWarning({
    eventName,
    hoursUntil,
    historicalAvgMove,
    affectedPositions
  }: MacroWarningInput): TelegramAlertResult {
    const positionsLine =
      affectedPositions.length > 0
        ? affectedPositions
            .map((position) => `- ${position.symbol} @ ${Number(position.leverage || 0)}x`)
            .join('\n')
        : 'None currently open';

    return {
      alertType: 'MACRO_EVENT',
      severity: hoursUntil < 3 ? 'CRITICAL' : 'WARNING',
      title: `${eventName} approaching`,
      message: [
        'MACRO EVENT INCOMING',
        '',
        `Event: ${eventName}`,
        `In: ${hoursUntil.toFixed(1)} hours`,
        `Average Historical Move: +/-${historicalAvgMove.toFixed(1)}%`,
        '',
        'Positions At Risk:',
        positionsLine,
        '',
        'High-impact releases can cause fast liquidations on leveraged books.',
        '',
        `Sentinel Finance | ${timestamp()}`
      ].join('\n')
    };
  },

  async sendMacroWarning(input: MacroWarningInput): Promise<TelegramAlertResult> {
    const payload = this.buildMacroWarning(input);
    const telegramSent = await this.sendMessage(payload.message, this.dashboardButton('/dashboard'));
    return { ...payload, telegramSent };
  },

  buildDailySummary({
    topSignal,
    positionsMonitored,
    alertsSent,
    claudeMemo
  }: DailySummaryInput): TelegramPayload {
    return {
      title: 'Sentinel Daily Summary',
      message: [
        'SENTINEL DAILY BRIEF',
        new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        }),
        '',
        `Top Signal: ${topSignal}`,
        `Positions Monitored: ${positionsMonitored}`,
        `Alerts Sent: ${alertsSent}`,
        '',
        'Claude Market Read:',
        claudeMemo,
        '',
        `Sentinel Finance | ${timestamp()}`
      ].join('\n')
    };
  },

  async sendDailySummary(input: DailySummaryInput): Promise<TelegramPayload & { telegramSent: boolean }> {
    const payload = this.buildDailySummary(input);
    const telegramSent = await this.sendMessage(payload.message, this.dashboardButton('/dashboard'));
    return { ...payload, telegramSent };
  },

  async sendTest(): Promise<boolean> {
    const message = [
      'Sentinel Finance bot is connected and running.',
      '',
      'You will receive narrative and liquidation alerts here.',
      '',
      `Sentinel Finance | ${timestamp()}`
    ].join('\n');

    return this.sendMessage(message, this.dashboardButton('/dashboard'));
  }
};

export = telegram;
