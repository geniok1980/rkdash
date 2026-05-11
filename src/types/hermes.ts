/** Ответы Hermes Dashboard API — поля могут расширяться версиями Hermes. */
export type HermesSkillRow = {
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  [key: string]: unknown;
};

export type HermesStatus = {
  version?: string;
  gateway?: { running?: boolean; [key: string]: unknown };
  [key: string]: unknown;
};

export type HermesToolsetRow = {
  id?: string;
  label?: string;
  name?: string;
  description?: string;
  active?: boolean;
  tools?: string[];
  [key: string]: unknown;
};

export type HermesTelegramAgent = {
  id: string;
  name: string;
  slug: string;
  telegramBotTokenMasked: string;
  chatId: string;
  createdAt: string;
  runtime?: {
    status: 'running' | 'stopped';
    pid?: number;
    startedAt?: string;
  };
};
