import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function RegisterPage() {
  const { merchant, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=phone, 2=otp, 3=register
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [form, setForm] = useState({ storeName: '', slug: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  if (merchant) return <Navigate to="/dashboard" replace />;

  // ─── Step 1: Send OTP ───────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!phone.trim()) {
      setErrors({ phone: 'Phone number is required' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const data = await api.sendOtp({ phone: phone.trim() });
      setOtpSent(true);
      // Start resend countdown
      setOtpCountdown(60);
      const timer = setInterval(() => {
        setOtpCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
      setStep(2);
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Verify OTP ──────────────────────────────────────────
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
      const data = await api.verifyOtp({ phone: phone.trim(), otp: otp.trim() });
      setVerificationToken(data.verificationToken);
      setStep(3);
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 3: Complete Registration ────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.storeName.trim()) errs.storeName = 'Store name is required';
    if (!form.slug.trim()) errs.slug = 'Store URL is required';
    else if (!/^[a-z0-9-]+$/.test(form.slug)) errs.slug = 'Only lowercase letters, numbers, hyphens';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const data = await register({
        storeName: form.storeName.trim(),
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
        whatsappNumber: phone.trim(),
        password: form.password,
        verificationToken,
      });
      setSuccess({ storeName: data.store.storeName, storeUrl: data.storeUrl, slug: data.store.slug, qrCode: data.qrCode });
    } catch (err) {
      setApiError(err.data?.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  // ─── Success State ──────────────────────────────────────────────
  if (success) {
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
                onClick={() => {
                  navigator.clipboard.writeText(success.storeUrl);
                }}
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-8">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-bold text-center mb-1">Create Your Store</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            {step === 1 && 'Start by verifying your phone number'}
            {step === 2 && 'Enter the verification code sent to your phone'}
            {step === 3 && 'Set up your store details'}
          </p>

          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">{apiError}</p>
            </div>
          )}

          {/* Step 1: Phone Number */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setErrors({}); }}
                  placeholder="+923001234567"
                  className={`w-full border ${errors.phone ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Sending code...' : 'Send Verification Code'}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
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
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>

              <div className="text-center">
                {otpCountdown > 0 ? (
                  <p className="text-xs text-gray-400">Resend in {otpCountdown}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Step 3: Registration Form */}
          {step === 3 && (
            <form onSubmit={handleRegister} className="space-y-4">
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

              <p className="text-xs text-gray-400 flex items-center gap-1">
                <span>✅</span> Phone verified
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating store...' : 'Create Store'}
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                ← Change phone number
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
