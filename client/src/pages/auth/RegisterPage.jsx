import { useState, useRef, useCallback } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function RegisterPage() {
  const { merchant, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=form, 2=otp, 3=success
  const [form, setForm] = useState({
    storeName: '', slug: '', email: '', whatsappNumber: '', password: '', confirmPassword: '',
  });
  const [otp, setOtp] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const timerRef = useRef(null);

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

  // ─── Step 1: Validate form & send OTP ──────────────────────────
  const validateForm = () => {
    const errs = {};
    if (!form.storeName.trim()) errs.storeName = 'Store name is required';
    if (!form.slug.trim()) errs.slug = 'Store URL is required';
    else if (!/^[a-z0-9-]+$/.test(form.slug)) errs.slug = 'Only lowercase letters, numbers, hyphens';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Invalid email format';
    if (!form.whatsappNumber.trim()) errs.whatsappNumber = 'WhatsApp number is required';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  const handleContinue = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validateForm();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const data = await api.sendOtp({ email: form.email.trim() });
      startCountdown();
      setStep(2);
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Verify OTP ─────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!otp.trim() || otp.trim().length !== 6) {
      setErrors({ otp: 'Enter the 6-digit verification code' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const data = await api.verifyOtp({ email: form.email.trim(), otp: otp.trim() });
      setVerificationToken(data.verificationToken);
      // Now register
      await handleRegister(data.verificationToken);
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setApiError('');
    setLoading(true);
    try {
      await api.resendOtp({ email: form.email.trim() });
      startCountdown();
      setOtp('');
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  // ─── Registration (called after OTP verification) ──────────────
  const handleRegister = async (token) => {
    try {
      const data = await register({
        storeName: form.storeName.trim(),
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
        whatsappNumber: form.whatsappNumber.trim(),
        email: form.email.trim(),
        password: form.password,
        verificationToken: token,
      });
      setSuccess({
        storeName: data.store.storeName,
        storeUrl: data.storeUrl,
        slug: data.store.slug,
        qrCode: data.qrCode,
      });
      setStep(3);
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Registration failed');
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  // ─── Success State ──────────────────────────────────────────────
  if (step === 3 && success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold mb-2">Store Created!</h1>
            <p className="text-gray-600 mb-6">{success.storeName} is ready to receive orders.</p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-500 mb-1">Your store URL</p>
              <p className="text-blue-600 font-medium break-all">{success.storeUrl}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigator.clipboard.writeText(success.storeUrl)}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
              >
                📋 Copy Store Link
              </button>
              <button
                onClick={() => {
                  const text = encodeURIComponent(`Check out my store: ${success.storeUrl}`);
                  window.open(`https://wa.me/?text=${text}`, '_blank');
                }}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700"
              >
                📱 Share via WhatsApp
              </button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800"
              >
                Go to Dashboard →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If already logged in and not in success state, redirect to dashboard
  if (merchant) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  {s}
                </div>
                {s < 2 && <div className={`w-8 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-bold text-center mb-1">Create Your Store</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            {step === 1 && 'Fill in your store details'}
            {step === 2 && 'Enter the verification code sent to your email'}
          </p>

          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">{apiError}</p>
            </div>
          )}

          {/* Step 1: Registration Form */}
          {step === 1 && (
            <form onSubmit={handleContinue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                <input
                  type="text"
                  value={form.storeName}
                  onChange={(e) => updateField('storeName', e.target.value)}
                  className={`w-full border ${errors.storeName ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {errors.storeName && <p className="text-red-500 text-xs mt-1">{errors.storeName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store URL</label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="bg-gray-50 px-2 text-gray-500 text-sm border-r border-gray-300">/store/</span>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="my-bakery"
                    className="flex-1 px-3 py-2 text-sm outline-none"
                  />
                </div>
                {errors.slug && <p className="text-red-500 text-xs mt-1">{errors.slug}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="merchant@example.com"
                  className={`w-full border ${errors.email ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                <input
                  type="tel"
                  value={form.whatsappNumber}
                  onChange={(e) => updateField('whatsappNumber', e.target.value)}
                  placeholder="+923001234567"
                  className={`w-full border ${errors.whatsappNumber ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {errors.whatsappNumber && <p className="text-red-500 text-xs mt-1">{errors.whatsappNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className={`w-full border ${errors.password ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  className={`w-full border ${errors.confirmPassword ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Sending code...' : 'Continue'}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                <p className="text-blue-700 text-sm">
                  📧 Verification code sent to <strong>{form.email}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrors({}); }}
                  placeholder="000000"
                  className={`w-full border ${errors.otp ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm text-center text-2xl tracking-widest`}
                  autoComplete="one-time-code"
                />
                {errors.otp && <p className="text-red-500 text-xs mt-1">{errors.otp}</p>}
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify & Create Store'}
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
                onClick={() => setStep(1)}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                ← Change details
              </button>
            </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have a store?{' '}
            <Link to="/login" className="text-blue-600 underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
