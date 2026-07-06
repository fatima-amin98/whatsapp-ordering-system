import { useState, useEffect } from 'react';
import { api } from '../../api';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import BusinessHoursEditor from './BusinessHoursEditor';

export default function StoreSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [form, setForm] = useState({});
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data.settings);
      setForm({
        storeName: data.settings.storeName || '',
        whatsappNumber: data.settings.whatsappNumber || '',
        allowDelivery: data.settings.allowDelivery !== false,
        allowPickup: data.settings.allowPickup !== false,
        deliveryFee: String(data.settings.deliveryFee || '0'),
        freeDeliveryThreshold: data.settings.freeDeliveryThreshold ? String(data.settings.freeDeliveryThreshold) : '',
        pickupAddress: data.settings.pickupAddress || '',
        pickupInstructions: data.settings.pickupInstructions || '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchQR = async () => {
    setQrLoading(true);
    try {
      const data = await api.getQRCode();
      setQrCode(data);
    } catch {
      // QR is non-critical
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        ...form,
        deliveryFee: parseFloat(form.deliveryFee) || 0,
        freeDeliveryThreshold: form.freeDeliveryThreshold ? parseFloat(form.freeDeliveryThreshold) : null,
      };
      const data = await api.updateSettings(body);
      setSettings(data.settings);
      fetchQR();
    } catch (err) {
      setSaveError(err.data?.error || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading settings..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchSettings} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Store Settings</h2>

      {/* QR Code Section */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-3">Your Store QR Code</h3>
        <p className="text-sm text-gray-500 mb-3">Customers scan this to visit your store</p>
        {qrLoading ? (
          <LoadingSpinner text="Generating QR..." />
        ) : qrCode ? (
          <div className="text-center">
            <img src={qrCode.qrCode} alt="Store QR Code" className="mx-auto w-48 h-48" />
            <p className="text-xs text-gray-400 mt-2 break-all">{qrCode.storeUrl}</p>
            <a
              href={qrCode.qrCode}
              download="store-qr.png"
              className="inline-block mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 no-print"
            >
              Download QR Code
            </a>
          </div>
        ) : (
          <button
            onClick={fetchQR}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            Generate QR Code
          </button>
        )}
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="bg-white rounded-lg border p-4 space-y-4">
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-700 text-sm">{saveError}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
          <input
            type="text"
            value={form.storeName}
            onChange={(e) => setForm({ ...form, storeName: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
          <input
            type="tel"
            value={form.whatsappNumber}
            onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allowDelivery}
              onChange={(e) => setForm({ ...form, allowDelivery: e.target.checked })}
              className="rounded border-gray-300"
            />
            Allow Delivery
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allowPickup}
              onChange={(e) => setForm({ ...form, allowPickup: e.target.checked })}
              className="rounded border-gray-300"
            />
            Allow Pickup
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Fee (PKR)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.deliveryFee}
              onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Free Delivery Above</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.freeDeliveryThreshold}
              onChange={(e) => setForm({ ...form, freeDeliveryThreshold: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Leave empty to disable"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Address</label>
          <textarea
            value={form.pickupAddress}
            onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows="2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Instructions</label>
          <textarea
            value={form.pickupInstructions}
            onChange={(e) => setForm({ ...form, pickupInstructions: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows="2"
            placeholder="Shown to customers on the store page"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      {/* Business Hours */}
      <div className="bg-white rounded-lg border p-4">
        <BusinessHoursEditor />
      </div>
    </div>
  );
}
