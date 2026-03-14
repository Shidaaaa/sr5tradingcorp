import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const services = [
  {
    emoji: '🚗',
    title: 'TEST DRIVE A VEHICLE',
    desc: 'Test drive our vehicles',
    details: ['Trucks', 'Tractors', 'Vans', 'Other Units'],
    color: 'from-blue-500 to-blue-700',
  },
  {
    emoji: '✂️',
    title: 'UPHOLSTERY',
    desc: 'Transform your vehicle\'s interior with professional upholstery repair and customization. We specialize in comfort, aesthetics, and long-lasting craftsmanship.',
    details: ['Minor and Major Repairs of unit Upholstery', 'Custom made Upholstery', 'Additional bucket seat installation'],
    color: 'from-purple-500 to-purple-700',
  },
  {
    emoji: '❄️',
    title: 'AIRCONDITIONING',
    desc: 'Stay cool and comfortable on the road. We provide expert repair, replacement, and maintenance services for automotive air conditioning systems.',
    details: ['Repair and Replacement services', 'Recharging or Refilling the refrigerant (Freon)', 'Car AC Installation'],
    color: 'from-cyan-500 to-cyan-700',
  },
  {
    emoji: '🔨',
    title: 'TINSMITH SERVICES',
    desc: 'High-quality metalwork and body customization for vehicles of all kinds. We handle everything from body dent repairs to full custom fabrication with precision and durability.',
    details: ['Food Truck Body Customization/Fabrication', 'Bullbar customization (Rear/Front)', 'Canopy Fabrication', 'Minor and Major Body Dent repairs', 'Body Alignment', 'Chassis Repairs'],
    color: 'from-amber-500 to-amber-700',
  },
  {
    emoji: '🖌️',
    title: 'PAINTING SERVICES',
    desc: 'Enhance and protect your vehicle\'s appearance with our professional auto painting services — from minor touch-ups to full color transformations.',
    details: ['PARTIAL Body Repainting & Repair', 'Full car Repaint (Washover) & Full Car Change Color', 'Underchassis Repaint', 'Underchassis Rubberizing', 'RE-Buffing', 'Mags Painting', 'Paint Restoration'],
    color: 'from-pink-500 to-pink-700',
  },
  {
    emoji: '🔧',
    title: 'MECHANIC SERVICES',
    desc: 'Comprehensive mechanical care for all vehicle types — from regular maintenance to complete engine overhauls. Our expert mechanics ensure your vehicle performs at its best.',
    details: [
      'Minor and Major Car Repairs and Reconditioning', 'Change oil', 'Brake service',
      'Air filter replacement', 'Wheel Alignment', 'Top Overhaul',
      'Complete Engine Overhaul', 'Engine Repair', 'Engine Replacement',
      'Transmission Replacement / Repair', 'Timing Belt Replacement',
      'Suspension and Steering', 'Unit Scanning and Diagnostics',
      'Parts replacement', 'Installation of accessories',
    ],
    color: 'from-emerald-500 to-emerald-700',
  },
];

export default function Services() {
  const { user } = useAuth();

  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-900 py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-40 w-80 h-80 bg-accent-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 left-20 w-60 h-60 bg-primary-500 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto px-4 text-center relative">
          <p className="text-accent-400 text-sm font-semibold tracking-[0.2em] mb-3">OUR COMMITMENT TO EXCELLENCE</p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">Reliable Fleet Services, Maximize Uptime</h1>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            We provide comprehensive maintenance and repair solutions to keep your commercial vehicles and heavy equipment operating at peak performance.
          </p>
        </div>
      </section>

      {/* Services List */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 space-y-16">
          {services.map((service, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-8 md:p-10 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4 mb-6">
                <span className="text-4xl">{service.emoji}</span>
                <div>
                  <h2 className="text-2xl font-bold text-navy-900">{service.title}</h2>
                  <p className="text-gray-600 mt-2">{service.desc}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-14">
                {service.details.map((detail, j) => (
                  <div key={j} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-gray-200">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${service.color} shrink-0`}></div>
                    <span className="text-sm text-gray-700">{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-navy-900">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Ready to Schedule Your Service?</h2>
          <p className="text-gray-400 mb-8">Contact us today for a detailed quote or to book a maintenance slot for your equipment.</p>
          {user ? (
            <Link to="/bookings" className="btn-accent btn-lg">Request an Appointment</Link>
          ) : (
            <Link to="/login" className="btn-accent btn-lg">Sign In to Request an Appointment</Link>
          )}
        </div>
      </section>
    </div>
  );
}
