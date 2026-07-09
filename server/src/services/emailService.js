import nodemailer from 'nodemailer';
import config from '../config.js';

// ─── Transporter (lazy init) ────────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!config.email.user || !config.email.pass) {
      console.warn('[Email] ⚠ No SMTP credentials configured. Emails will be logged to console.');
      console.warn('[Email]   Set EMAIL_USER and EMAIL_PASS in .env to enable email sending.');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  }
  return transporter;
}

/**
 * Verify SMTP connection. Call at startup to confirm credentials are valid.
 * Resolves if the transporter is not configured (console-only mode).
 * Rejects if SMTP credentials exist but authentication fails.
 */
export async function verifyTransporter() {
  const t = getTransporter();
  if (!t) return; // no-op when using console fallback

  try {
    await t.verify();
    console.log('[Email] ✅ Gmail SMTP authenticated —', config.email.user);
    console.log('[Email]   From:', config.email.from);
    console.log('[Email]   Email service ready');
  } catch (err) {
    console.error('[Email] ❌ SMTP authentication failed.');
    console.error('[Email]    Possible causes:');
    console.error('[Email]    - Incorrect Gmail App Password');
    console.error('[Email]    - 2FA not enabled on the Google account');
    console.error('[Email]    - EMAIL_USER:', config.email.user);
    console.error('[Email]    - Gmail blocked the sign-in attempt');
    console.error('[Email]    Error:', err.message);
    throw err;
  }
}

// ─── HTML Templates ─────────────────────────────────────────────────

function baseHtml(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb; }
    .logo { font-size: 24px; font-weight: 800; color: #1f2937; margin-bottom: 8px; }
    .divider { height: 1px; background: #e5e7eb; margin: 20px 0; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px; }
    .footer a { color: #6b7280; text-decoration: underline; }
    @media only screen and (max-width: 480px) { .card { padding: 20px; } }
  </style>
</head>
<body>
  <div class="wrapper">
    ${bodyContent}
  </div>
</body>
</html>`;
}

function otpTemplate({ otp, storeName, purpose }) {
  const heading = purpose === 'registration'
    ? 'Verify your email address'
    : 'Reset your password';
  const intro = purpose === 'registration'
    ? `Thanks for signing up${storeName ? ` for <strong>${storeName}</strong>` : ''}! Use the code below to verify your email address.`
    : 'We received a request to reset your password. Use the code below to proceed.';

  return baseHtml(`
    <div class="card">
      <div class="logo">${heading}</div>
      <div class="divider"></div>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">${intro}</p>
      <div style="text-align: center; margin: 24px 0;">
        <div style="display: inline-block; background: #f3f4f6; border-radius: 12px; padding: 16px 32px; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #1f2937;">${otp}</div>
      </div>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">This code expires in <strong>5 minutes</strong>.</p>
      <p style="color: #6b7280; font-size: 13px; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>WhatsApp Store — Built for local merchants</p>
    </div>
  `);
}

function passwordResetSuccessTemplate() {
  return baseHtml(`
    <div class="card">
      <div class="logo">Password updated</div>
      <div class="divider"></div>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Your password has been successfully updated.</p>
      <p style="color: #6b7280; font-size: 13px; margin: 0;">If you did not make this change, please contact support immediately.</p>
    </div>
    <div class="footer">
      <p>WhatsApp Store — Built for local merchants</p>
    </div>
  `);
}

function orderNotificationTemplate({ customerName, customerPhone, orderNumber, products, total, fulfillmentMethod, deliveryAddress, storeName }) {
  const productRows = products.map(p =>
    `<tr><td style="padding: 6px 0; color: #4b5563;">${p.productName}</td><td style="padding: 6px 0; text-align: center; color: #4b5563;">${p.quantity}</td></tr>`
  ).join('');

  return baseHtml(`
    <div class="card">
      <div class="logo">🛒 New Order — #${orderNumber}</div>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 16px 0;">${storeName}</p>
      <div class="divider"></div>

      <h3 style="color: #1f2937; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Customer details</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #6b7280; width: 100px;">Name</td><td style="padding: 4px 0; color: #1f2937;">${customerName}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Phone</td><td style="padding: 4px 0; color: #1f2937;">${customerPhone}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Method</td><td style="padding: 4px 0; color: #1f2937;">${fulfillmentMethod === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</td></tr>
        ${fulfillmentMethod === 'delivery' && deliveryAddress ? `<tr><td style="padding: 4px 0; color: #6b7280;">Address</td><td style="padding: 4px 0; color: #1f2937;">${deliveryAddress}</td></tr>` : ''}
      </table>

      <div class="divider"></div>

      <h3 style="color: #1f2937; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Order items</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <th style="text-align: left; padding: 8px 0; color: #6b7280; font-weight: 500;">Item</th>
            <th style="text-align: center; padding: 8px 0; color: #6b7280; font-weight: 500;">Qty</th>
          </tr>
        </thead>
        <tbody>${productRows}</tbody>
      </table>

      <div style="margin-top: 16px; text-align: right; font-size: 18px; font-weight: 700; color: #1f2937;">
        Total: PKR ${Number(total).toLocaleString()}
      </div>

      <div class="divider"></div>
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Placed ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
      </p>
    </div>
    <div class="footer">
      <p>WhatsApp Store — Built for local merchants</p>
    </div>
  `);
}

function welcomeTemplate({ storeName, storeUrl, loginUrl, email }) {
  return baseHtml(`
    <div class="card">
      <div class="logo">🎉 Welcome to WhatsApp Store!</div>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">${storeName}</p>
      <div class="divider"></div>

      <p style="color: #4b5563; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
        Your store <strong>${storeName}</strong> has been created successfully. You're now ready to start receiving orders from your customers.
      </p>

      <h3 style="color: #1f2937; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Your store details</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #6b7280; width: 120px;">Store URL</td><td style="padding: 4px 0; color: #1f2937;"><a href="${storeUrl}" style="color: #2563eb; text-decoration: underline;">${storeUrl}</a></td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Login URL</td><td style="padding: 4px 0; color: #1f2937;"><a href="${loginUrl}" style="color: #2563eb; text-decoration: underline;">${loginUrl}</a></td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Email</td><td style="padding: 4px 0; color: #1f2937;">${email}</td></tr>
      </table>

      <div class="divider"></div>

      <h3 style="color: #1f2937; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Getting started</h3>
      <ol style="color: #4b5563; font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 0;">
        <li><strong>Add products</strong> — Log in to your dashboard and start adding the items you sell.</li>
        <li><strong>Share your store</strong> — Send your store URL to customers so they can browse and place orders.</li>
        <li><strong>Manage orders</strong> — When orders come in, you'll receive real-time notifications and can manage them from your dashboard.</li>
      </ol>

      <div class="divider"></div>

      <p style="color: #6b7280; font-size: 13px; margin: 0;">
        <strong>Security reminder:</strong> Use the password you created during registration to sign in. Never share your password with anyone. If you ever forget it, you can reset it from the login page.
      </p>
    </div>
    <div class="footer">
      <p>WhatsApp Store — Built for local merchants</p>
    </div>
  `);
}

// ─── Send functions ─────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const t = getTransporter();

  if (!t) {
    console.log(`[Email] 📋 Would send to=${to} subject="${subject}"`);
    return { sent: false, method: 'console' };
  }

  try {
    const info = await t.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
    });
    console.log(`[Email] ✅ Sent to ${to} (messageId: ${info.messageId})`);
    return { sent: true, method: 'smtp', messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] ❌ Failed to send to ${to}:`, err.message);
    throw err;
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export async function sendOtpEmail({ email, otp, storeName, purpose = 'registration' }) {
  const subject = purpose === 'registration'
    ? 'Verify your email — WhatsApp Store'
    : 'Reset your password — WhatsApp Store';
  return sendEmail({
    to: email,
    subject,
    html: otpTemplate({ otp, storeName, purpose }),
  });
}

export async function sendPasswordResetSuccessEmail({ email }) {
  return sendEmail({
    to: email,
    subject: 'Password updated — WhatsApp Store',
    html: passwordResetSuccessTemplate(),
  });
}

export async function sendNewOrderNotification({ email, customerName, customerPhone, orderNumber, products, total, fulfillmentMethod, deliveryAddress, storeName }) {
  return sendEmail({
    to: email,
    subject: `🛒 New Order #${orderNumber} — ${storeName}`,
    html: orderNotificationTemplate({
      customerName,
      customerPhone,
      orderNumber,
      products,
      total,
      fulfillmentMethod,
      deliveryAddress,
      storeName,
    }),
  });
}

export async function sendWelcomeEmail({ email, storeName, storeUrl, loginUrl }) {
  return sendEmail({
    to: email,
    subject: `🎉 Welcome to WhatsApp Store, ${storeName}!`,
    html: welcomeTemplate({ storeName, storeUrl, loginUrl, email }),
  });
}

export default { sendOtpEmail, sendPasswordResetSuccessEmail, sendNewOrderNotification, sendWelcomeEmail };
