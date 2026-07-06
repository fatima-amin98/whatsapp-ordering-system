import { createContext, useContext, useReducer, useCallback } from 'react';

const CartContext = createContext(null);

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.productId === action.product.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.productId === action.product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { productId: action.product.id, name: action.product.name, price: action.product.price, quantity: 1 }],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === action.productId
            ? { ...i, quantity: Math.max(1, action.quantity) }
            : i
        ),
      };
    case 'CLEAR_CART':
      return { ...state, items: [] };
    case 'SET_FULFILLMENT':
      return { ...state, fulfillmentMethod: action.method };
    case 'SET_CUSTOMER_NAME':
      return { ...state, customerName: action.value };
    case 'SET_CUSTOMER_PHONE':
      return { ...state, customerPhone: action.value };
    case 'SET_DELIVERY_ADDRESS':
      return { ...state, deliveryAddress: action.value };
    default:
      return state;
  }
}

const initialState = {
  items: [],
  fulfillmentMethod: 'delivery',
  customerName: '',
  customerPhone: '',
  deliveryAddress: '',
};

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const addItem = useCallback((product) => dispatch({ type: 'ADD_ITEM', product }), []);
  const removeItem = useCallback((productId) => dispatch({ type: 'REMOVE_ITEM', productId }), []);
  const updateQuantity = useCallback((productId, quantity) => dispatch({ type: 'UPDATE_QUANTITY', productId, quantity }), []);
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);

  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        ...state,
        subtotal,
        itemCount: state.items.reduce((sum, i) => sum + i.quantity, 0),
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        dispatch,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside CartProvider');
  return ctx;
}
