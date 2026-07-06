export default function EmptyState({ title, message, action, actionLabel }) {
  return (
    <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
      <p className="text-gray-400 text-4xl mb-3">📭</p>
      <h3 className="text-lg font-medium text-gray-800 mb-1">{title}</h3>
      <p className="text-gray-500 mb-4">{message}</p>
      {action && actionLabel && (
        <button onClick={action} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
