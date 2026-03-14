import { Link } from 'react-router-dom';
import { FiPhone, FiMapPin } from 'react-icons/fi';

export default function Footer() {
  return (
    <footer className="bg-navy-950 text-gray-400" id="contact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Cavite */}
          <div>
            <h4 className="text-white font-bold text-lg mb-4">Cavite</h4>
            <div className="space-y-2 text-sm mb-4">
              <p className="flex items-center gap-2"><FiPhone size={14} className="text-accent-500 shrink-0" /> +63 969 272 7377</p>
              <p className="flex items-center gap-2"><FiPhone size={14} className="text-accent-500 shrink-0" /> +63 917 556 1897</p>
            </div>
            <div className="space-y-4">
              <div>
                <h5 className="text-white font-semibold text-sm mb-1">Bacoor Branch</h5>
                <p className="text-xs flex items-start gap-2"><FiMapPin size={14} className="text-accent-500 shrink-0 mt-0.5" /> Reveal Subdivision Real 1 Bacoor Cavite 4102</p>
              </div>
              <div>
                <h5 className="text-white font-semibold text-sm mb-1">Imus Branch</h5>
                <p className="text-xs flex items-start gap-2"><FiMapPin size={14} className="text-accent-500 shrink-0 mt-0.5" /> Sanchez Compound Bayan Luma 7 Imus Cavite 4103</p>
              </div>
            </div>
          </div>

          {/* Bicol */}
          <div>
            <h4 className="text-white font-bold text-lg mb-4">Bicol</h4>
            <div className="space-y-2 text-sm mb-4">
              <p className="flex items-center gap-2"><FiPhone size={14} className="text-accent-500 shrink-0" /> +63 917 710 4758</p>
              <p className="flex items-center gap-2"><FiPhone size={14} className="text-accent-500 shrink-0" /> +63 917 575 8157</p>
              <p className="flex items-center gap-2"><FiPhone size={14} className="text-accent-500 shrink-0" /> +63 917 556 1897</p>
            </div>
            <div className="space-y-4">
              <div>
                <h5 className="text-white font-semibold text-sm mb-1">Warehouse</h5>
                <p className="text-xs flex items-start gap-2"><FiMapPin size={14} className="text-accent-500 shrink-0 mt-0.5" /> Purok 1 Malabog Maharlika Highway Daraga Albay 4501</p>
              </div>
              <div>
                <h5 className="text-white font-semibold text-sm mb-1">Main Branch</h5>
                <p className="text-xs flex items-start gap-2"><FiMapPin size={14} className="text-accent-500 shrink-0 mt-0.5" /> Purok 1 Barangay Ilawod Maharlika Highway Camalig Albay 4502</p>
              </div>
            </div>
          </div>

          {/* Additional Links */}
          <div>
            <h4 className="text-white font-bold text-lg mb-4">Additional Links</h4>
            <div className="space-y-2.5">
              <Link to="/products" className="block text-sm hover:text-white transition-colors">All Products</Link>
              <Link to="/vehicles" className="block text-sm hover:text-white transition-colors">Vehicles</Link>
              <Link to="/services" className="block text-sm hover:text-white transition-colors">Services</Link>
              <Link to="/bookings" className="block text-sm hover:text-white transition-colors">Appointments</Link>
              <Link to="/feedback" className="block text-sm hover:text-white transition-colors">Feedback</Link>
            </div>
          </div>

          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-extrabold text-xs">SR-5</span>
              </div>
              <div>
                <p className="font-bold text-white text-sm">SR-5 Trading</p>
                <p className="text-[10px] text-gray-500">Corporation</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Your trusted source for quality Japan surplus vehicles, parts, and automotive services in the Philippines.
            </p>
          </div>
        </div>

        <div className="border-t border-navy-800 mt-12 pt-8 text-center">
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-400">SR-5 Trading Corporation</span> &copy; {new Date().getFullYear()} - All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
