import { useState, useEffect } from 'react';
import { api } from '../../api';

const DAYS = [
  { index: 0, name: 'Sunday' },
  { index: 1, name: 'Monday' },
  { index: 2, name: 'Tuesday' },
  { index: 3, name: 'Wednesday' },
  { index: 4, name: 'Thursday' },
  { index: 5, name: 'Friday' },
  { index: 6, name: 'Saturday' },
];

export default function BusinessHoursEditor() {
  const [hours, setHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.getBusinessHours()
      .then((data) => {
        const mapped = DAYS.map((d) => {
          const existing = data.hours.find((h) => h.dayOfWeek === d.index);
          return {
            dayOfWeek: d.index,
            openTime: existing?.openTime?.slice(0, 5) || '09:00',
            closeTime: existing?.closeTime?.slice(0, 5) || '21:00',
            isClosed: existing?.isClosed || false,
          };
        });
        setHours(mapped);
      })
      .catch(() => setMessage({ type: 'error', text: 'Failed to load business hours' }))
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (idx) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === idx ? { ...h, isClosed: !h.isClosed } : h))
    );
  };

  const updateTime = (idx, field, value) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === idx ? { ...h, [field]: value } : h))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateBusinessHours({ hours });
      setMessage({ type: 'success', text: 'Business hours saved' });
    } catch (err) {
      setMessage({ type: 'error', text: err.data?.error || err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading business hours...</p>;
  }

  return (
    <div>
      <h3 className="font-semibold mb-3">Business Hours</h3>
      <p className="text-sm text-gray-500 mb-3">Orders can only be placed during these hours (Pakistan time)</p>

      {message && (
        <div className={`p-2 rounded-lg mb-3 text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        {hours.map((h) => {
          const day = DAYS.find((d) => d.index === h.dayOfWeek);
          return (
            <div key={h.dayOfWeek} className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-28 text-sm">
                <input
                  type="checkbox"
                  checked={!h.isClosed}
                  onChange={() => toggleDay(h.dayOfWeek)}
                  className="rounded border-gray-300"
                />
                {day?.name}
              </label>
              {!h.isClosed ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={h.openTime}
                    onChange={(e) => updateTime(h.dayOfWeek, 'openTime', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={h.closeTime}
                    onChange={(e) => updateTime(h.dayOfWeek, 'closeTime', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Hours'}
      </button>
    </div>
  );
}
