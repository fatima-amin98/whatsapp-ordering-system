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

function ProductCard({ product, index, onToggle, onEdit, onDuplicate, onDelete, onDragStart, onDragOver, onDragEnd, dragIndex }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg border p-4 ${!product.isAvailable ? 'opacity-60' : ''} ${dragIndex === index ? 'ring-2 ring-blue-300' : ''} cursor-grab active:cursor-grabbing transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          </svg>
        </div>
        <ProductImage imageUrl={product.imageUrl} name={product.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{product.name}</h3>
            {!product.isAvailable && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Unavailable</span>
            )}
          </div>
          {product.description && <p className="text-sm text-gray-500 mt-0.5">{product.description}</p>}
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-blue-600 font-bold">{formatPKR(product.price)}</p>
            {product.categoryName && (
              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{product.categoryName}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 items-center">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={product.isAvailable}
              onChange={() => onToggle(product.id)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            <span className="ml-2 text-xs text-gray-500 min-w-[60px]">
              {product.isAvailable ? 'ON' : 'OFF'}
            </span>
          </label>
          <button onClick={() => onEdit(product)} className="text-blue-600 text-sm hover:underline">Edit</button>
          <button onClick={() => onDuplicate(product.id)} className="text-gray-500 text-sm hover:underline">Duplicate</button>
          <button onClick={() => onDelete(product.id)} className="text-red-500 text-sm hover:underline">Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', description: '', imageUrl: '', categoryId: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [formErrors, setFormErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  const fetchProducts = async (search) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProducts(search || '');
      // Attach category names for display
      const withCategoryNames = data.products.map(p => ({
        ...p,
        categoryName: categories.find(c => c.id === p.categoryId)?.name || null,
      }));
      setProducts(withCategoryNames);
    } catch (err) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getCategories().then(data => {
      setCategories(data.categories);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, categories]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', price: '', description: '', imageUrl: '', categoryId: '' });
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
      categoryId: product.categoryId || '',
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
        categoryId: form.categoryId || null,
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

  const handleDuplicate = async (id) => {
    try {
      await api.duplicateProduct(id);
      await fetchProducts();
    } catch (err) {
      alert(err.data?.error || 'Failed to duplicate');
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

  // ─── Category CRUD ──────────────────────────────────────────────
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) return;
    setSaving(true);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, { name: categoryForm.name.trim() });
      } else {
        await api.createCategory({ name: categoryForm.name.trim() });
      }
      const data = await api.getCategories();
      setCategories(data.categories);
      setShowCategoryModal(false);
    } catch (err) {
      alert(err.data?.error || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Delete this category? Products in this category will be uncategorized.')) return;
    try {
      await api.deleteCategory(id);
      const data = await api.getCategories();
      setCategories(data.categories);
      await fetchProducts();
    } catch (err) {
      alert(err.data?.error || 'Failed to delete category');
    }
  };

  // ─── Drag and Drop Reorder ───────────────────────────────────────
  const [dragIndex, setDragIndex] = useState(null);

  const handleDragStart = (index) => {
    setDragIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const newProducts = [...activeCategoryFiltered];
    const [moved] = newProducts.splice(dragIndex, 1);
    newProducts.splice(index, 0, moved);
    setProducts((prev) => {
      // Map reordered items back to full product list
      const otherIds = new Set(newProducts.map(p => p.id));
      const unchanged = prev.filter(p => !otherIds.has(p.id));
      return [...unchanged, ...newProducts];
    });
    setDragIndex(index);
  };

  const handleDragEnd = async () => {
    setDragIndex(null);
    const productIds = activeCategoryFiltered.map(p => p.id);
    try {
      await api.reorderProducts(productIds);
    } catch {
      await fetchProducts();
    }
  };

  // ─── Filtered products by search & category ─────────────────────
  const activeCategoryFiltered = activeCategory
    ? products.filter(p => p.categoryId === activeCategory)
    : products;

  if (loading) return <LoadingSpinner text="Loading products..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchProducts} />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-xl font-bold">Products</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-full sm:w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={openNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Category filter tabs */}
      {(categories.length > 0 || activeCategory) && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setActiveCategory('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !activeCategory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
          <button
            onClick={() => setShowCategoryModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Manage categories"
          >
            + Manage
          </button>
        </div>
      )}

      {activeCategoryFiltered.length === 0 && !loading && (
        <EmptyState
          title={products.length === 0 ? 'No products yet' : 'No products in this category'}
          message={products.length === 0 ? 'Add your first product to start receiving orders' : 'Add products to this category or select a different category'}
          action={products.length === 0 ? openNew : undefined}
          actionLabel={products.length === 0 ? 'Add Product' : undefined}
        />
      )}

      <div className="space-y-3">
        {activeCategory ? (
          /* Single category: flat drag-and-drop list */
          activeCategoryFiltered.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              dragIndex={dragIndex}
            />
          ))
        ) : (
          /* All categories: grouped sections */
          <>
            {/* Uncategorized products first */}
            {products.filter(p => !p.categoryId).length > 0 && (
              <div>
                <div className="grid gap-3">
                  {products.filter(p => !p.categoryId).map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      index={index}
                      onToggle={handleToggle}
                      onEdit={openEdit}
                      onDuplicate={handleDuplicate}
                      onDelete={handleDelete}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      dragIndex={dragIndex}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Categorized products */}
            {categories.map((cat) => {
              const catProducts = products.filter(p => p.categoryId === cat.id);
              if (catProducts.length === 0) return null;
              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{cat.name}</h3>
                    <span className="text-xs text-gray-400">({catProducts.length})</span>
                  </div>
                  <div className="grid gap-3">
                    {catProducts.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        index={index}
                        onToggle={handleToggle}
                        onEdit={openEdit}
                        onDuplicate={handleDuplicate}
                        onDelete={handleDelete}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                        dragIndex={dragIndex}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Product Modal */}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <div className="flex gap-2">
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">No category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setEditingCategory(null); setCategoryForm({ name: '' }); setShowCategoryModal(true); }}
                    className="text-blue-600 hover:text-blue-800 text-sm px-2"
                    title="Manage categories"
                  >
                    ✏️
                  </button>
                </div>
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

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4">Manage Categories</h3>

            <form onSubmit={handleSaveCategory} className="flex gap-2 mb-4">
              <input
                type="text"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ name: e.target.value })}
                placeholder="New category name"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                maxLength={100}
              />
              <button
                type="submit"
                disabled={saving || !categoryForm.name.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '...' : editingCategory ? 'Update' : 'Add'}
              </button>
            </form>

            {categories.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium">{cat.name}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setEditingCategory(cat); setCategoryForm({ name: cat.name }); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setShowCategoryModal(false); setEditingCategory(null); }}
              className="w-full mt-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
