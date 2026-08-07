/**
 * @jest-environment node
 */

describe('emailService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  function loadService() {
    return require('../api/services/emailService');
  }

  it('defaults to console sender outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.EMAIL_PROVIDER;
    const logs = [];
    const {
      createEmailSenderFromEnv,
      createConsoleEmailSender,
      sendEmail,
      setEmailSender,
      resetEmailSender,
    } = loadService();

    const sender = createEmailSenderFromEnv();
    expect(sender.name).toBe('console');

    setEmailSender(
      createConsoleEmailSender({
        logger: { log: (...args) => logs.push(args.join(' ')) },
      })
    );
    await sendEmail({ to: 'a@example.com', subject: 'Hi', text: 'body' });
    expect(logs[0]).toContain('a@example.com');
    expect(logs[0]).toContain('Hi');
    resetEmailSender();
  });

  it('refuses console default in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_PROVIDER;
    const { createEmailSenderFromEnv } = loadService();
    expect(() => createEmailSenderFromEnv()).toThrow(/EMAIL_PROVIDER must be set/);
  });

  it('memory sender captures messages and reset tokens', async () => {
    const { createMemoryEmailSender } = loadService();
    const mailer = createMemoryEmailSender();
    await mailer.send({
      to: 'user@example.com',
      subject: 'Password Reset Request',
      text: 'Use this secure link to reset your password: http://localhost:3000/reset/abc-123',
    });
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.extractResetToken()).toBe('abc-123');
  });

  it('setEmailSender injects a custom sender for sendEmail', async () => {
    const { setEmailSender, sendEmail, resetEmailSender } = loadService();
    const sent = [];
    setEmailSender({
      async send(message) {
        sent.push(message);
      },
    });
    await sendEmail({ to: 'x@y.z', subject: 'S', text: 'T' });
    expect(sent).toEqual([{ to: 'x@y.z', subject: 'S', text: 'T' }]);
    resetEmailSender();
  });
});
