import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin, Package, Plus, ShieldCheck, Trash2, User } from 'lucide-react';
import { cn } from '../utils/cn';
import { formatDate, formatPrice } from '../utils/format';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { OrderListSkeleton } from '../components/ui/PageSkeletons';
import { LogoutButton } from '../components/auth/LogoutButton';
import { useAuth, useOrders } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { usePageSeo } from '../components/SEO/SEOHead';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'orders', label: 'My Orders', icon: Package },
  { id: 'addresses', label: 'Saved Addresses', icon: MapPin },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  /* Security is a route rather than a tab — §20 gives it its own address, and
     a link somebody can be sent after a suspicious sign-in. */
  { id: 'security', label: 'Security', icon: ShieldCheck, to: '/account/security' },
];

const EMPTY_ADDRESS = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  isDefault: false,
};

export default function Account() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/account', title: 'My Account', noindex: true });

  const { user, updateProfile, addresses, saveAddress, removeAddress } = useAuth();
  /* Fetches on mount — orders are no longer loaded on every page of the shop. */
  const { orders, ordersStatus } = useOrders();
  const { count: wishlistCount } = useWishlist();
  const { toast } = useToast();

  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ name: '' });
  const [addressForm, setAddressForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /* The profile arrives with the session, which may still be in flight on the
     first render. */
  useEffect(() => {
    if (user) setProfile({ name: user.name || '' });
  }, [user]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const result = await updateProfile(profile);
    setSaving(false);

    if (result.ok) toast('Profile updated');
    else setError(result.message);
  };

  const handleAddressSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const result = await saveAddress(addressForm);
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAddressForm(null);
    toast('Address saved');
  };

  const handleAddressRemove = async (id) => {
    const result = await removeAddress(id);
    if (result.ok) toast('Address removed');
    else setError(result.message);
  };

  return (
    <div className="container-site py-6 lg:py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My Account' }]} />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-beige pb-6">
        <div>
          <p className="eyebrow">My Account</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Hello, {user.name}</h1>
          <p className="mt-2 text-[12px] text-charcoal-muted">
            Member since {formatDate(user.joinedAt)}
          </p>
        </div>

        <LogoutButton />
      </header>

      <div className="grid gap-8 py-8 lg:grid-cols-[220px_1fr] lg:gap-14">
        {/* Tabs */}
        <nav aria-label="Account sections">
          <ul className="flex gap-2 overflow-x-auto hide-scrollbar lg:flex-col lg:gap-1 lg:overflow-visible">
            {TABS.map((t) => {
              const className = cn(
                'flex w-full items-center gap-2.5 whitespace-nowrap border px-4 py-3 text-[11px] font-medium uppercase tracking-widest2 transition-colors lg:border-0 lg:border-l-2 lg:px-4',
                tab === t.id && !t.to
                  ? 'border-charcoal bg-charcoal text-cream lg:bg-transparent lg:text-charcoal'
                  : 'border-beige text-charcoal-muted hover:text-charcoal lg:border-transparent',
              );

              return (
                <li key={t.id} className="shrink-0">
                  {t.to ? (
                    <Link to={t.to} className={className}>
                      <t.icon size={14} aria-hidden="true" />
                      {t.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTab(t.id)}
                      aria-current={tab === t.id ? 'true' : undefined}
                      className={className}
                    >
                      <t.icon size={14} aria-hidden="true" />
                      {t.label}
                      {t.id === 'orders' && orders.length > 0 ? ` (${orders.length})` : ''}
                      {t.id === 'wishlist' && wishlistCount > 0 ? ` (${wishlistCount})` : ''}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Panels */}
        <div>
          {tab === 'profile' ? (
            <section aria-label="Profile">
              <h2 className="font-display text-2xl">Profile</h2>
              <p className="mt-2 text-sm text-charcoal-muted">
                Saved to your SOPII account and used on every order you place.
              </p>

              <form onSubmit={handleProfileSave} className="mt-6 max-w-md space-y-5">
                <div>
                  <label htmlFor="name" className="field-label">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="field"
                  />
                </div>

                {/* The email identifies the account and is what a guest order is
                    matched on, so it is shown rather than edited. */}
                <div>
                  <label htmlFor="email" className="field-label">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={user.email || ''}
                    readOnly
                    className="field bg-sand/40 text-charcoal-muted"
                  />
                  <p className="mt-1 text-[11px] text-charcoal-faint">
                    Write to us if this needs changing.
                  </p>
                </div>

                {/*
                  The mobile number is a credential, not a profile field: it can
                  sign somebody in on its own (§5), so it is changed by proving
                  the new number with an OTP rather than by typing over it here.
                */}
                <div>
                  <label htmlFor="mobile" className="field-label">
                    Mobile number
                  </label>
                  <input
                    id="mobile"
                    type="tel"
                    value={user.mobile || 'Not verified'}
                    readOnly
                    className="field bg-sand/40 text-charcoal-muted"
                  />
                  <p className="mt-1 text-[11px] text-charcoal-faint">
                    {user.mobileVerified ? 'Verified. ' : ''}
                    <Link
                      to="/account/security"
                      className="text-charcoal underline underline-offset-2"
                    >
                      {user.mobileVerified ? 'Change it in Security' : 'Verify a number in Security'}
                    </Link>{' '}
                    to use it for signing in.
                  </p>
                </div>

                {error ? (
                  <p role="alert" className="text-[12px] text-sale">
                    {error}
                  </p>
                ) : null}

                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <Spinner size={13} /> Saving
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </form>
            </section>
          ) : null}

          {tab === 'orders' ? (
            <section aria-label="Orders">
              <h2 className="font-display text-2xl">My Orders</h2>

              {ordersStatus === 'loading' && orders.length === 0 ? (
                <OrderListSkeleton className="mt-6" count={2} />
              ) : null}

              {orders.length === 0 && ordersStatus !== 'loading' ? (
                <EmptyState
                  icon={Package}
                  title="No orders yet"
                  text="When you place an order it will appear here with its full history."
                  action={{ label: 'Start Shopping', to: '/shop' }}
                  className="border border-dashed border-beige"
                />
              ) : null}

              {orders.length > 0 ? (
                <ul className="mt-6 space-y-4">
                  {orders.map((order) => (
                    <li key={order.id} className="border border-beige bg-cream p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <div>
                          <p className="font-display text-lg">#{order.id}</p>
                          <p className="text-[11px] text-charcoal-muted">
                            {formatDate(order.placedAt)} ·{' '}
                            {order.items.reduce((s, i) => s + i.quantity, 0)} items
                          </p>
                        </div>
                        <span className="border border-clay/40 bg-sand/60 px-3 py-1 text-[10px] uppercase tracking-widest2 text-clay">
                          {order.status}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-4 border-t border-beige pt-4">
                        <span className="font-medium">{formatPrice(order.totals.total)}</span>
                        <Link
                          to={`/order-success/${order.id}`}
                          className="text-[11px] font-medium uppercase tracking-widest2 text-clay link-underline"
                        >
                          View details
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {tab === 'addresses' ? (
            <section aria-label="Saved addresses">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl">Saved Addresses</h2>
                {!addressForm ? (
                  <button
                    type="button"
                    onClick={() => setAddressForm({ ...EMPTY_ADDRESS })}
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest2 text-clay"
                  >
                    <Plus size={13} aria-hidden="true" /> Add new
                  </button>
                ) : null}
              </div>

              {addressForm ? (
                <form
                  onSubmit={handleAddressSave}
                  className="mt-6 grid max-w-2xl gap-4 border border-beige bg-cream p-5 sm:grid-cols-2"
                >
                  {[
                    ['fullName', 'Full name', 'sm:col-span-2'],
                    ['phone', 'Mobile number', 'sm:col-span-2'],
                    ['line1', 'Address line 1', 'sm:col-span-2'],
                    ['line2', 'Address line 2 (optional)', 'sm:col-span-2'],
                    ['city', 'City', ''],
                    ['state', 'State', ''],
                    ['pincode', 'PIN code', ''],
                  ].map(([key, label, span]) => (
                    <div key={key} className={span}>
                      <label htmlFor={`addr-${key}`} className="field-label">
                        {label}
                      </label>
                      <input
                        id={`addr-${key}`}
                        value={addressForm[key]}
                        onChange={(e) => setAddressForm({ ...addressForm, [key]: e.target.value })}
                        required={key !== 'line2'}
                        className="field"
                      />
                    </div>
                  ))}

                  <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-charcoal-muted sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={addressForm.isDefault}
                      onChange={(e) =>
                        setAddressForm({ ...addressForm, isDefault: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-charcoal"
                    />
                    Make this my default address
                  </label>

                  {error ? (
                    <p role="alert" className="text-[12px] text-sale sm:col-span-2">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex gap-3 sm:col-span-2">
                    <button type="submit" disabled={saving} className="btn-primary">
                      {saving ? (
                        <>
                          <Spinner size={13} /> Saving
                        </>
                      ) : (
                        'Save Address'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddressForm(null)}
                      className="btn-outline"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {addresses.length === 0 && !addressForm ? (
                <EmptyState
                  icon={MapPin}
                  title="No saved addresses"
                  text="Save an address to check out in a couple of taps next time."
                  action={{ label: 'Add Address', onClick: () => setAddressForm({ ...EMPTY_ADDRESS }) }}
                  className="border border-dashed border-beige"
                />
              ) : null}

              {addresses.length > 0 ? (
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {addresses.map((address) => (
                    <li key={address.id} className="relative border border-beige bg-cream p-5">
                      {address.isDefault ? (
                        <span className="absolute right-4 top-4 border border-clay/40 px-2 py-0.5 text-[9px] uppercase tracking-widest2 text-clay">
                          Default
                        </span>
                      ) : null}

                      <p className="pr-16 text-[13px] font-medium">{address.fullName}</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-charcoal-muted">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}
                        <br />
                        {address.city}, {address.state} {address.pincode}
                        <br />
                        {address.phone}
                      </p>

                      <div className="mt-4 flex gap-4 border-t border-beige pt-3">
                        <button
                          type="button"
                          onClick={() => setAddressForm(address)}
                          className="text-[11px] uppercase tracking-widest2 text-charcoal-muted hover:text-charcoal"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddressRemove(address.id)}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest2 text-charcoal-muted hover:text-sale"
                        >
                          <Trash2 size={12} aria-hidden="true" /> Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {tab === 'wishlist' ? (
            <section aria-label="Wishlist">
              <h2 className="font-display text-2xl">Wishlist</h2>
              <p className="mt-2 text-sm text-charcoal-muted">
                {wishlistCount > 0
                  ? `You have ${wishlistCount} ${wishlistCount === 1 ? 'piece' : 'pieces'} saved.`
                  : 'Nothing saved yet.'}
              </p>
              <Link to="/wishlist" className="btn-outline mt-6">
                <Heart size={13} aria-hidden="true" /> Open Wishlist
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
