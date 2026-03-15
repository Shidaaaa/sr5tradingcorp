import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { FiShoppingCart, FiUser, FiMenu, FiX, FiLogOut, FiPackage, FiCalendar, FiMessageSquare, FiSettings, FiChevronDown, FiTruck, FiTool } from 'react-icons/fi';
import { useState, useRef, useEffect } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [browseMenu, setBrowseMenu] = useState(false);
  const browseRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (browseRef.current && !browseRef.current.contains(e.target)) setBrowseMenu(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    const shouldLogout = window.confirm('Are you sure you would like to log out?');
    if (!shouldLogout) return;
    logout();
    navigate('/');
    setUserMenu(false);
  };

  const navLinkClass = ({ isActive }) =>
    `px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-accent-400' : 'text-gray-300 hover:text-white'}`;

  return (
    <nav className="bg-navy-900 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-extrabold text-xs">SR-5</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-bold text-white text-sm leading-tight tracking-wide">SR-5 Trading</p>
              <p className="text-[10px] text-gray-400 leading-tight">Corporation</p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>Home</NavLink>

            {/* Browse Dropdown */}
            <div className="relative" ref={browseRef}>
              <button
                onClick={() => setBrowseMenu(!browseMenu)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors text-gray-300 hover:text-white"
              >
                Browse <FiChevronDown size={14} className={`transition-transform ${browseMenu ? 'rotate-180' : ''}`} />
              </button>
              {browseMenu && (
                <div className="absolute top-full left-0 mt-1 w-52 bg-navy-800 rounded-xl shadow-xl border border-navy-700 py-2 animate-slide-down">
                  <Link to="/browse/trucks" onClick={() => setBrowseMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors">
                    <FiTruck size={16} /> Trucks
                  </Link>
                  <Link to="/browse/tractors" onClick={() => setBrowseMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors">
                    <FiTruck size={16} /> Tractors
                  </Link>
                  <Link to="/browse/vans" onClick={() => setBrowseMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors">
                    <FiTruck size={16} /> Vans
                  </Link>
                  <Link to="/browse/other-units" onClick={() => setBrowseMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors">
                    <FiTruck size={16} /> Other Units
                  </Link>
                  <hr className="border-navy-700 my-1" />
                  <Link to="/products" onClick={() => setBrowseMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors">
                    <FiTool size={16} /> Parts & Accessories
                  </Link>
                  <Link to="/products" onClick={() => setBrowseMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-accent-400 hover:bg-navy-700 hover:text-accent-300 transition-colors font-medium">
                    <FiPackage size={16} /> View All Products
                  </Link>
                </div>
              )}
            </div>

            <NavLink to="/services" className={navLinkClass}>Services</NavLink>
            {user && <NavLink to="/bookings" className={navLinkClass}>Appointments</NavLink>}
            {user && <NavLink to="/orders" className={navLinkClass}>My Orders</NavLink>}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link to="/cart" className="relative p-2 text-gray-300 hover:text-white transition-colors">
                  <FiShoppingCart size={20} />
                  {cart.count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-accent-500 text-white text-[10px] font-bold rounded-full min-w-[18px] min-h-[18px] flex items-center justify-center">
                      {cart.count}
                    </span>
                  )}
                </Link>

                <div className="relative" ref={userRef}>
                  <button
                    onClick={() => setUserMenu(!userMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-navy-800"
                  >
                    <div className="w-7 h-7 bg-primary-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{user.first_name?.[0]}</span>
                    </div>
                    <span className="hidden sm:inline text-sm font-medium">{user.first_name}</span>
                    <FiChevronDown size={14} />
                  </button>

                  {userMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-navy-800 rounded-xl shadow-xl border border-navy-700 py-2 animate-slide-down">
                      <div className="px-4 py-3 border-b border-navy-700">
                        <p className="font-semibold text-white text-sm">{user.first_name} {user.last_name}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                      <Link to="/profile" onClick={() => setUserMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white"><FiUser size={16} /> Profile</Link>
                      <Link to="/orders" onClick={() => setUserMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white"><FiPackage size={16} /> My Orders</Link>
                      <Link to="/bookings" onClick={() => setUserMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white"><FiCalendar size={16} /> Appointments</Link>
                      <Link to="/feedback" onClick={() => setUserMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white"><FiMessageSquare size={16} /> Feedback</Link>
                      {user.role === 'admin' && (
                        <Link to="/admin" onClick={() => setUserMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-accent-400 hover:bg-navy-700 hover:text-accent-300 font-medium"><FiSettings size={16} /> Admin Panel</Link>
                      )}
                      <hr className="border-navy-700 my-1" />
                      <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-navy-700 hover:text-red-300 w-full"><FiLogOut size={16} /> Logout</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">Sign In</Link>
                <Link to="/register" className="btn-accent btn-sm">Register</Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 text-gray-300 hover:text-white">
              {mobileMenu ? <FiX size={22} /> : <FiMenu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden py-4 border-t border-navy-800 space-y-1 animate-slide-down">
            <Link to="/" onClick={() => setMobileMenu(false)} className="block px-3 py-2.5 rounded-lg text-gray-300 hover:bg-navy-800 hover:text-white">Home</Link>
            <Link to="/products" onClick={() => setMobileMenu(false)} className="block px-3 py-2.5 rounded-lg text-gray-300 hover:bg-navy-800 hover:text-white">Browse Products</Link>
            <Link to="/vehicles" onClick={() => setMobileMenu(false)} className="block px-3 py-2.5 rounded-lg text-gray-300 hover:bg-navy-800 hover:text-white">Vehicles</Link>
            <Link to="/services" onClick={() => setMobileMenu(false)} className="block px-3 py-2.5 rounded-lg text-gray-300 hover:bg-navy-800 hover:text-white">Services</Link>
            {user && <Link to="/bookings" onClick={() => setMobileMenu(false)} className="block px-3 py-2.5 rounded-lg text-gray-300 hover:bg-navy-800 hover:text-white">Appointments</Link>}
            {user && <Link to="/orders" onClick={() => setMobileMenu(false)} className="block px-3 py-2.5 rounded-lg text-gray-300 hover:bg-navy-800 hover:text-white">My Orders</Link>}
          </div>
        )}
      </div>
    </nav>
  );
}
