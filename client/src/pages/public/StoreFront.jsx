import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatPKR } from '../../utils/formatCurrency';
import { validatePhone } from '../../utils/validatePhone';
import { CartProvider, useCart } from '../../context/CartContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ProductImage({ imageUrl, name, size = 'full' }) {
  const [errored, setErrored] = useState(false);
  if (!imageUrl || errored) {
    const classes = size === 'list'
      ? 'w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-gray-300 flex-shrink-0'
      : 'w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300';
    return <div className={classes}><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>;
  }
  const classes = size === 'list'
    ? 'w-16 h-16 object-cover rounded flex-shrink-0'
    : 'w-full h-32 object-cover rounded-lg';
  return <img src={imageUrl} alt={name || 'Product'} className={classes} onError={() => setErrored(true)} />;
}

function StoreContent() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [showCheckout, setShowCheckout] = useState(false);
  const productGridRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getStore(slug), api.getStoreProducts(slug), api.getStoreCategories(slug)])
      .then(([storeData, productsData, categoriesData]) => {
        setStore(storeData.store);
        setProducts(productsData.products);
        setCategories(categoriesData.categories || []);
        if (storeData.store.allowPickup && !storeData.store.allowDelivery) {
          cart.dispatch({ type: 'SET_FULFILLMENT', method: 'pickup' });
        }
      })
      .catch((err) => setError(err.message || 'Failed to load store'))
      .finally(() => setLoading(false));
  }, [slug]);

  const calculateDeliveryFee = () => {
    if (!store || cart.fulfillmentMethod !== 'delivery') return 0;
    if (store.freeDeliveryThreshold && cart.subtotal >= store.freeDeliveryThreshold) return 0;
    return store.deliveryFee;
  };

  const total = cart.subtotal + calculateDeliveryFee();

  const validateForm = () => {
    const errors = {};
    if (!cart.customerName.trim()) errors.customerName = 'Name is required';
    const phoneCheck = validatePhone(cart.customerPhone);
    if (!phoneCheck.valid) errors.customerPhone = phoneCheck.error;
    if (cart.fulfillmentMethod === 'delivery' && !cart.deliveryAddress.trim()) {
      errors.deliveryAddress = 'Delivery address is required';
    }
    if (cart.items.length === 0) errors.items = 'Cart is empty';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validateForm()) return;
    if (!store.isOpen) {
      setSubmitError('Store is currently closed. Please check business hours.');
      return;
    }

    setSubmitting(true);
    try {
      const phoneCheck = validatePhone(cart.customerPhone);
      const data = await api.createOrder(slug, {
        customerName: cart.customerName.trim(),
        customerPhone: phoneCheck.cleaned,
        fulfillmentMethod: cart.fulfillmentMethod,
        deliveryAddress: cart.fulfillmentMethod === 'delivery' ? cart.deliveryAddress.trim() : null,
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });

      cart.clearCart();
      navigate(data.confirmUrl);
    } catch (err) {
      setSubmitError(err.data?.error || err.message || 'Checkout failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  function renderProductCard(product, cart) {
    const inCart = cart.items.find((i) => i.productId === product.id);
    return (
      <div key={product.id} className={`bg-white rounded-lg border p-4 ${!product.isAvailable ? 'opacity-50' : ''}`}>
        <div className="flex gap-3">
          {product.imageUrl && (
            <ProductImage imageUrl={product.imageUrl} name={product.name} size="list" />
          )}
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{product.name}</h3>
                {product.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{product.description}</p>
                )}
                <p className="text-blue-600 font-bold mt-1">{formatPKR(product.price)}</p>
              </div>
              <div className="ml-3">
                {!product.isAvailable ? (
                  <span className="text-xs text-gray-400">Unavailable</span>
                ) : store.isOpen ? (
                  <div className="flex items-center gap-2">
                    {inCart ? (
                      <>
                        <button
                          onClick={() => cart.updateQuantity(product.id, inCart.quantity - 1)}
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                          disabled={inCart.quantity <= 1}
                        >−</button>
                        <span className="w-6 text-center font-medium">{inCart.quantity}</span>
                        <button
                          onClick={() => cart.updateQuantity(product.id, inCart.quantity + 1)}
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                        >+</button>
                        <button
                          onClick={() => cart.removeItem(product.id)}
                          className="text-xs text-red-500 ml-1"
                        >✕</button>
                      </>
                    ) : (
                      <button
                        onClick={() => cart.addItem(product)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
                      >Add</button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingSpinner text="Loading store..." />;
  if (error) return <div className="max-w-lg mx-auto p-4"><ErrorMessage message={error} /></div>;
  if (!store) return <div className="max-w-lg mx-auto p-4"><ErrorMessage message="Store not found" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{store.storeName}</h1>
          {store.storeStatus === 'temporarily_closed' ? (
            <span className="text-sm bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Temporarily Closed</span>
          ) : store.storeStatus === 'closed' ? (
            <span className="text-sm bg-red-100 text-red-700 px-2 py-0.5 rounded">Closed</span>
          ) : !store.isOpen ? (
            <span className="text-sm bg-red-100 text-red-700 px-2 py-0.5 rounded">Closed</span>
          ) : (
            <span className="text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded">Open</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-32">
        {store.pickupInstructions && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 my-4 text-sm text-yellow-800">
            {store.pickupInstructions}
          </div>
        )}

        {!store.isOpen && (
          <div className="bg-gray-100 rounded-lg p-4 my-4 text-center">
            <p className="text-gray-700 font-medium">Store is currently closed</p>
            <div className="mt-2 text-sm text-gray-500">
              {store.businessHours?.filter(h => !h.isClosed).map(h => (
                <div key={h.dayOfWeek}>{DAY_NAMES[h.dayOfWeek]}: {h.openTime?.slice(0,5)} - {h.closeTime?.slice(0,5)}</div>
              ))}
            </div>
          </div>
        )}

        <div ref={productGridRef} className="grid gap-6 my-4">
          {products.length === 0 && (
            <p className="text-center text-gray-500 py-8">No products available</p>
          )}

          {/* Uncategorized products */}
          {products.filter(p => !p.categoryId).length > 0 && (
            <div className="grid gap-4">
              {products.filter(p => !p.categoryId).map((product) => renderProductCard(product, cart))}
            </div>
          )}

          {/* Products grouped by category */}
          {categories.map((cat) => {
            const catProducts = products.filter(p => p.categoryId === cat.id);
            if (catProducts.length === 0) return null;
            return (
              <div key={cat.id}>
                <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-2">{cat.name}</h3>
                <div className="grid gap-4">
                  {catProducts.map(product => renderProductCard(product, cart))}
                </div>
              </div>
            );
          })}
        </div>

        {cart.items.length > 0 && store.isOpen && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
            <div className="max-w-lg mx-auto">

              {/* Cart summary — always visible */}
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold">{cart.itemCount} item{cart.itemCount !== 1 ? 's' : ''}</span>
                <span className="font-bold text-blue-600">{formatPKR(cart.subtotal)}</span>
              </div>

              {submitError && <p className="text-red-600 text-sm mb-2">{submitError}</p>}

              {/* Collapsed: Proceed to Checkout button */}
              {!showCheckout && (
                <button
                  onClick={() => setShowCheckout(true)}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
                >
                  Proceed to Checkout
                </button>
              )}

              {/* Expanded: checkout form */}
              {showCheckout && (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowCheckout(false);
                      productGridRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    ← Back to Menu
                  </button>

                  {(store.allowDelivery && store.allowPickup) && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => cart.dispatch({ type: 'SET_FULFILLMENT', method: 'delivery' })}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium ${cart.fulfillmentMethod === 'delivery' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                      >Delivery</button>
                      <button
                        onClick={() => cart.dispatch({ type: 'SET_FULFILLMENT', method: 'pickup' })}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium ${cart.fulfillmentMethod === 'pickup' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                      >Pickup</button>
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="Your name *"
                    value={cart.customerName}
                    onChange={(e) => cart.dispatch({ type: 'SET_CUSTOMER_NAME', value: e.target.value })}
                    className={`w-full border ${formErrors.customerName ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                  />
                  {formErrors.customerName && <p className="text-red-500 text-xs">{formErrors.customerName}</p>}

                  <input
                    type="tel"
                    placeholder="Phone (03001234567 or +923001234567) *"
                    value={cart.customerPhone}
                    onChange={(e) => cart.dispatch({ type: 'SET_CUSTOMER_PHONE', value: e.target.value })}
                    className={`w-full border ${formErrors.customerPhone ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                  />
                  {formErrors.customerPhone && <p className="text-red-500 text-xs">{formErrors.customerPhone}</p>}

                  {cart.fulfillmentMethod === 'delivery' && (
                    <>
                      <textarea
                        placeholder="Delivery address *"
                        value={cart.deliveryAddress}
                        onChange={(e) => cart.dispatch({ type: 'SET_DELIVERY_ADDRESS', value: e.target.value })}
                        className={`w-full border ${formErrors.deliveryAddress ? 'border-red-400' : 'border-gray-300'} rounded-lg px-3 py-2 text-sm`}
                        rows="2"
                      />
                      {formErrors.deliveryAddress && <p className="text-red-500 text-xs">{formErrors.deliveryAddress}</p>}
                    </>
                  )}

                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{formatPKR(cart.subtotal)}</span>
                    </div>
                    {cart.fulfillmentMethod === 'delivery' && (
                      <div className="flex justify-between">
                        <span>Delivery fee</span>
                        <span>
                          {store.freeDeliveryThreshold && cart.subtotal >= store.freeDeliveryThreshold
                            ? <span className="text-green-600">Free</span>
                            : formatPKR(calculateDeliveryFee())
                          }
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
                      <span>Total</span>
                      <span>{formatPKR(total)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={submitting}
                    className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {submitting ? 'Placing order...' : `Place Order — ${formatPKR(total)}`}
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    After placing your order, you'll be taken to an order confirmation page
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StoreFront() {
  return (
    <CartProvider>
      <StoreContent />
    </CartProvider>
  );
}
