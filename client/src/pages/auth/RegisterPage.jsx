import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function RegisterPage() {
  const { merchant, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ storeName: '', slug: '', whatsappNumber: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  if (merchant) return <Navigate to="/dashboard" replace />;

  const validate = () => {
    const errs = {};
    if (!form.storeName.trim()) errs.storeName = 'Store name is required';
    if (!form.slug.trim()) errs.slug = 'Store URL is required';
    else if (!/^[a-z0-9-]+$/.test(form.slug)) errs.slug = 'Only lowercase letters, numbers, hyphens';
    const cleaned = form.whatsappNumber.replace(/[\s-]/g, '');
    if (!cleaned) errs.whatsappNumber = 'WhatsApp number is required';
    else if (!/^(\+92|03)[0-9]{9}$/.test(cleaned)) errs.whatsappNumber = 'Enter a valid Pakistani number';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      await register({
        storeName: form.storeName.trim(),
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
        whatsappNumber: form.whatsappNumber.replace(/[\s-]/g, ''),
        password: form.password,
      });
      navigate('/dashboard', { replace: true });
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 py-8">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-center mb-1">Create Your Store</h1>
          <p className="text-sm text-gray-500 text-center mb-6">Start accepting orders via WhatsApp</p>

          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">{apiError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
              {loading ? 'Creating store...' : 'Create Store'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have a store?{' '}
            <Link to="/login" className="text-blue-600 underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
