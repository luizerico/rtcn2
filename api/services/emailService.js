/**
 * Pluggable email sender for transactional mail (password reset, etc.).
 *
 * Providers (EMAIL_PROVIDER):
 * - console (default in development/test): logs to stdout; safe for local/CI
 * - memory: in-process capture for tests (also via createMemoryEmailSender)
 * - smtp: nodemailer transport when SMTP_* env vars are set
 * - module: load EMAIL_SENDER_MODULE (exports send or { send })
 *
 * Production refuses the console default so reset links are not silently logged.
 */

/**
 * @typedef {Object} EmailMessage
 * @property {string} to
 * @property {string} subject
 * @property {string} [text]
 * @property {string} [html]
 * @property {string} [from]
 */

/**
 * @typedef {Object} EmailSender
 * @property {(message: EmailMessage) => Promise<void>} send
 */

function assertMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new Error('Email message is required.');
  }
  if (!message.to || !message.subject) {
    throw new Error('Email message requires `to` and `subject`.');
  }
}

function createConsoleEmailSender({ logger = console } = {}) {
  return {
    name: 'console',
    /**
     * @param {EmailMessage} message
     */
    async send(message) {
      assertMessage(message);
      const body = message.text || message.html || '';
      logger.log(
        `[email:console] To: ${message.to} | Subject: ${message.subject}${
          body ? ` | Body: ${body}` : ''
        }`
      );
    },
  };
}

/**
 * In-memory sender for tests — captures messages instead of delivering.
 * @returns {EmailSender & { messages: EmailMessage[], clear: () => void, last: () => EmailMessage | undefined, extractResetToken: () => string | null }}
 */
function createMemoryEmailSender() {
  /** @type {EmailMessage[]} */
  const messages = [];

  return {
    name: 'memory',
    messages,
    async send(message) {
      assertMessage(message);
      messages.push({ ...message });
    },
    clear() {
      messages.length = 0;
    },
    last() {
      return messages[messages.length - 1];
    },
    /**
     * Pull a `/reset/<token>` segment from the last message body.
     * @returns {string | null}
     */
    extractResetToken() {
      const last = messages[messages.length - 1];
      if (!last) return null;
      const body = `${last.text || ''}\n${last.html || ''}`;
      const match = body.match(/\/reset\/([A-Za-z0-9._~-]+)/);
      return match ? match[1] : null;
    },
  };
}

function createModuleEmailSender(modulePath = process.env.EMAIL_SENDER_MODULE) {
  if (!modulePath) {
    throw new Error('EMAIL_SENDER_MODULE is required when EMAIL_PROVIDER=module.');
  }

  // Dynamic path from env (operator-provided mailer module).
  const loaded = require(modulePath);
  const send = typeof loaded === 'function' ? loaded : loaded?.send;
  if (typeof send !== 'function') {
    throw new Error(
      `EMAIL_SENDER_MODULE "${modulePath}" must export a send(message) function.`
    );
  }

  return {
    name: 'module',
    async send(message) {
      assertMessage(message);
      await send(message);
    },
  };
}

function createSmtpEmailSender() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user;

  if (!host || !from) {
    throw new Error(
      'SMTP email requires SMTP_HOST and EMAIL_FROM (and usually SMTP_USER/SMTP_PASS).'
    );
  }

  // Optional dependency — only needed when EMAIL_PROVIDER=smtp.
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (err) {
    throw new Error(
      'EMAIL_PROVIDER=smtp requires the nodemailer package. Install it or use EMAIL_PROVIDER=module.'
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: user ? { user, pass } : undefined,
  });

  return {
    name: 'smtp',
    async send(message) {
      assertMessage(message);
      await transporter.sendMail({
        from: message.from || from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve the configured sender from env. Safe console default for test/dev only.
 * @returns {EmailSender}
 */
function createEmailSenderFromEnv() {
  const provider = String(process.env.EMAIL_PROVIDER || '')
    .trim()
    .toLowerCase();

  if (provider === 'memory') {
    return createMemoryEmailSender();
  }
  if (provider === 'module') {
    return createModuleEmailSender();
  }
  if (provider === 'smtp') {
    return createSmtpEmailSender();
  }
  if (provider === 'console' || (!provider && !isProduction())) {
    return createConsoleEmailSender();
  }
  if (!provider && isProduction()) {
    throw new Error(
      'EMAIL_PROVIDER must be set in production (smtp or module). Console email is not allowed.'
    );
  }

  throw new Error(
    `Unknown EMAIL_PROVIDER "${provider}". Use console, memory, smtp, or module.`
  );
}

/** @type {EmailSender | null} */
let activeSender = null;

/**
 * @returns {EmailSender}
 */
function getEmailSender() {
  if (!activeSender) {
    activeSender = createEmailSenderFromEnv();
  }
  return activeSender;
}

/**
 * Replace the active sender (tests / custom wiring). Pass null to re-resolve from env.
 * @param {EmailSender | null} sender
 */
function setEmailSender(sender) {
  activeSender = sender;
}

function resetEmailSender() {
  activeSender = null;
}

/**
 * @param {EmailMessage} message
 * @returns {Promise<void>}
 */
async function sendEmail(message) {
  await getEmailSender().send(message);
}

module.exports = {
  createConsoleEmailSender,
  createMemoryEmailSender,
  createModuleEmailSender,
  createSmtpEmailSender,
  createEmailSenderFromEnv,
  getEmailSender,
  setEmailSender,
  resetEmailSender,
  sendEmail,
};
