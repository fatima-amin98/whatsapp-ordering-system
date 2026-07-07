import { useState, useEffect } from 'react';
import { api } from '../../api';
import { formatPKR } from '../../utils/formatCurrency';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import EmptyState from '../../components/EmptyState';
import ImageUploader from '../../components/ImageUploader';

function ProductImage({ imageUrl, name }) {
  const [errored, setErrored] = useState(false);
  if (!imageUrl || errored) {
    return (
      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-300 flex-shrink-0">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt={name || 'Product'}
      className="w-12 h-12 object-cover rounded flex-shrink-0"
      onError={() => setErrored(true)}
    />
  );
}

export default function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', description: '', imageUrl: '' });
  const [formErrors, setFormErrors] = useState({});

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProducts();
      setProducts(data.products);
    } catch (err) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', price: '', description: '', imageUrl: '' });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name,
      price: String(product.price),
      description: product.description || '',
      imageUrl: product.imageUrl || '',
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0) errs.price = 'Valid price required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        price: parseFloat(form.price),
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
      };

      if (editing) {
        await api.updateProduct(editing.id, body);
      } else {
        await api.createProduct(body);
      }

      setShowModal(false);
      await fetchProducts();
    } catch (err) {
      setFormErrors({ submit: err.data?.error || err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      await api.toggleProduct(id);
      await fetchProducts();
    } catch (err) {
      alert('Failed to toggle product');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product? Items in past orders will be preserved.')) return;
    try {
      await api.deleteProduct(id);
      await fetchProducts();
    } catch (err) {
      alert(err.data?.error || 'Failed to delete');
    }
  };

  if (loading) return <LoadingSpinner text="Loading products..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchProducts} />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Products</h2>
        <button
          onClick={openNew}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Add Product
        </button>
      </div>

      {products.length === 0 && (
        <EmptyState
          title="No products yet"
          message="Add your first product to start receiving orders"
          action={openNew}
          actionLabel="Add Product"
        />
      )}

      <div className="space-y-3">
        {products.map((product) => (
          <div key={product.id} className={`bg-white rounded-lg border p-4 ${!product.isAvailable ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <ProductImage imageUrl={product.imageUrl} name={product.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{product.name}</h3>
                  {!product.isAvailable && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Unavailable</span>
                  )}
                </div>
                {product.description && <p className="text-sm text-gray-500 mt-0.5">{product.description}</p>}
                <p className="text-blue-600 font-bold mt-1">{formatPKR(product.price)}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleToggle(product.id)}
                  className={`px-2 py-1 text-xs rounded ${product.isAvailable ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                >
                  {product.isAvailable ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => openEdit(product)} className="text-blue-600 text-sm hover:underline">Edit</button>
                <button onClick={() => handleDelete(product.id)} className="text-red-500 text-sm hover:underline">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Product' : 'Add Product'}</h3>

            {formErrors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{formErrors.submit}</p>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`w-full border ${formErrors.name ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (PKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={`w-full border ${formErrors.price ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                />
                {formErrors.price && <p className="text-red-500 text-xs mt-1">{formErrors.price}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows="2"
                />
              </div>

              <div>
                <ImageUploader
                  currentImageUrl={form.imageUrl || null}
                  onImageUrlChange={(url) => setForm((prev) => ({ ...prev, imageUrl: url || '' }))}
                  error={formErrors.imageUrl}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
