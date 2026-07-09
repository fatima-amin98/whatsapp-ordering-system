import { useState, useRef, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function ForgotPasswordPage() {
  const { merchant } = useAuth();

  // 1=slug, 2=otp, 3=new-password, 4=success
  const [step, setStep] = useState(1);
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState(''); // real email returned from API (not displayed)
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const timerRef = useRef(null);

  if (merchant) return <Navigate to="/dashboard" replace />;

  const startCountdown = useCallback(() => {
    setOtpCountdown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ─── Step 1: Lookup slug → send OTP to registered email ──────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!slug.trim() || !/^[a-z0-9-]{2,100}$/.test(slug.trim().toLowerCase())) {
      setError('Please enter a valid store URL');
      return;
    }
    setLoading(true);
    try {
      const data = await api.forgotPassword({ slug: slug.trim().toLowerCase() });
      // Store the email for subsequent API calls (not displayed)
      if (data.email) {
        setEmail(data.email);
        setMaskedEmail(data.maskedEmail || '');
      }
      startCountdown();
      setStep(2);
    } catch (err) {
      setSuccessMsg('If this store exists, a password reset code has been sent to the registered email.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Verify OTP ──────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const data = await api.verifyResetOtp({ email, otp: otp.trim() });
      setResetToken(data.resetToken);
      setStep(3);
    } catch (err) {
      setError(err.data?.error || err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await api.forgotPassword({ slug: slug.trim().toLowerCase() });
      if (data.email) setEmail(data.email);
      startCountdown();
      setOtp('');
    } catch {
      // Generic — don't reveal account existence
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 3: Set new password ────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ resetToken, password });
      setStep(4);
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">

          {/* Header */}
          <h1 className="text-2xl font-bold text-center mb-1">
            {step === 1 && 'Forgot Password'}
            {step === 2 && 'Check Your Email'}
            {step === 3 && 'Set New Password'}
            {step === 4 && 'Password Updated'}
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            {step === 1 && 'Enter your store URL to receive a password reset code'}
            {step === 2 && 'A reset code has been sent to your registered email'}
            {step === 3 && 'Choose a strong password for your store'}
            {step === 4 && 'You can now sign in with your new password'}
          </p>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Success notice */}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-green-700 text-sm">{successMsg}</p>
            </div>
          )}

          {/* Step 1: Store URL */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store URL</label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="bg-gray-50 px-2 text-gray-500 text-sm border-r border-gray-300">/store/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
                    placeholder="my-bakery"
                    className="flex-1 px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                <p className="text-blue-700 text-sm">
                  📧 A reset code has been sent to{' '}
                  <strong>{maskedEmail || 'your registered email'}</strong>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  placeholder="000000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center text-2xl tracking-widest"
                  autoComplete="one-time-code"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
              <div className="text-center">
                {otpCountdown > 0 ? (
                  <p className="text-xs text-gray-400">Resend in {otpCountdown}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setStep(1); setSuccessMsg(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                ← Change store
              </button>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === 3 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">At least 8 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="text-5xl">✅</div>
              <p className="text-gray-600 text-sm">Your password has been updated successfully.</p>
              <Link
                to="/login"
                className="block w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Bottom links */}
          {step < 4 && (
            <p className="text-center text-sm text-gray-500 mt-6">
              <Link to="/login" className="text-blue-600 underline">Back to Sign In</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
