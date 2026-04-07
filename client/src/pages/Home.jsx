import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { FiUsers, FiShoppingCart, FiCalendar, FiMapPin, FiChevronDown, FiArrowRight, FiHeart, FiAward, FiMap } from 'react-icons/fi';
import { api } from '../api';

const heroSlides = [
  {
    bg: 'from-navy-900 via-navy-800 to-primary-900',
    title: 'Welcome to SR-5 Trading Corporation',
    subtitle: 'IMPORTER \u2022 REBUILDER \u2022 DEALER',
    cta: '/products',
    ctaText: 'Get Started',
  },
  {
    bg: 'from-primary-900 via-navy-900 to-navy-800',
    title: 'Explore Our Inventory',
    subtitle: 'Discover Quality Products and Parts',
    cta: '/products',
    ctaText: 'Get Started',
  },
  {
    bg: 'from-navy-800 via-primary-800 to-navy-900',
    title: 'Expert Automotive Care',
    subtitle: 'Professional Service You Can Trust',
    cta: '/services',
    ctaText: 'Get Started',
  },
  {
    bg: 'from-navy-950 via-navy-900 to-primary-900',
    title: 'Visit Us Today',
    subtitle: 'Three Convenient Locations to Serve You',
    cta: '#contact',
    ctaText: 'Get Started',
  },
];

const DEFAULT_STATS = {
  users: 0,
  transactions: 0,
  appointments: 0,
  locations: 3,
};

const faqs = [
  { q: 'What services do you offer?', a: 'We offer a wide range of services including vehicle sales, parts and accessories, test drive bookings, upholstery, airconditioning, tinsmith, painting, and mechanic services.' },
  { q: 'How can I join the community?', a: 'Simply create an account on our website to start browsing products, booking services, and placing orders online.' },
  { q: 'Where are you located?', a: 'We have branches in Bacoor and Imus, Cavite, and in Daraga and Camalig, Albay (Bicol region).' },
  { q: 'Do you collaborate with other organizations?', a: 'Yes, we work with various suppliers and partners both locally and internationally to provide the best products and services.' },
];

function AnimatedCounter({ target, duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let start = 0;
          const step = target / (duration / 16);
          const timer = setInterval(() => {
            start += step;
            if (start >= target) { setCount(target); clearInterval(timer); }
            else setCount(Math.floor(start));
          }, 16);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count}</span>;
}

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [openFaq, setOpenFaq] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.getPublicStats();
        setStats({
          users: Number(data?.users || 0),
          transactions: Number(data?.transactions || 0),
          appointments: Number(data?.appointments || 0),
          locations: Number(data?.locations || 3),
        });
      } catch {
        setStats(DEFAULT_STATS);
      }
    };

    fetchStats();
  }, []);

  const statsCards = [
    { icon: <FiUsers size={28} />, value: stats.users, label: 'Users' },
    { icon: <FiShoppingCart size={28} />, value: stats.transactions, label: 'Transactions' },
    { icon: <FiCalendar size={28} />, value: stats.appointments, label: 'Appointments' },
    { icon: <FiMapPin size={28} />, value: stats.locations, label: 'Locations' },
  ];

  return (
    <div>
      {/* Hero Carousel */}
      <section className="relative h-[600px] md:h-[700px] overflow-hidden">
        {heroSlides.map((slide, i) => (
          <div
            key={i}
            className={`absolute inset-0 bg-gradient-to-br ${slide.bg} transition-opacity duration-1000 ${i === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
          >
            {/* Decorative pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-20 right-20 w-96 h-96 bg-accent-500 rounded-full blur-3xl"></div>
              <div className="absolute bottom-20 left-20 w-72 h-72 bg-primary-500 rounded-full blur-3xl"></div>
            </div>
            <div className="relative h-full flex items-center">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                <div className={`max-w-3xl transition-all duration-700 ${i === currentSlide ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                  {i === 0 && (
                    <p className="text-accent-400 text-sm md:text-base font-semibold tracking-[0.2em] mb-4">{slide.subtitle}</p>
                  )}
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">{slide.title}</h1>
                  {i !== 0 && (
                    <p className="text-xl md:text-2xl text-gray-300 mb-8">{slide.subtitle}</p>
                  )}
                  <Link to={slide.cta} className="inline-flex items-center gap-2 btn-accent btn-lg text-lg group">
                    {slide.ctaText} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Slide Indicators */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-accent-500' : 'w-2 bg-white/40 hover:bg-white/60'}`}
            />
          ))}
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={() => setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white transition-all"
        >
          &#8249;
        </button>
        <button
          onClick={() => setCurrentSlide((prev) => (prev + 1) % heroSlides.length)}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white transition-all"
        >
          &#8250;
        </button>
      </section>

      {/* Stats Section */}
      <section className="bg-navy-900 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {statsCards.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-navy-800 rounded-2xl text-accent-400 mb-4">
                  {stat.icon}
                </div>
                <p className="text-4xl md:text-5xl font-bold text-white mb-1">
                  <AnimatedCounter target={stat.value} />
                </p>
                <p className="text-gray-400 text-sm font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-heading text-navy-900">About Us</h2>
          <p className="section-subheading">
            We are dedicated to providing the best services and experiences. Our community thrives on innovation, collaboration, and growth. With a strong presence across multiple regions, we strive to create lasting impact and value for all our members.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            {[
              { icon: <FiHeart size={36} />, title: 'Customer First', desc: 'Dedicated to your satisfaction' },
              { icon: <FiAward size={36} />, title: 'Quality Service', desc: 'Excellence in every detail' },
              { icon: <FiMap size={36} />, title: 'Multiple Locations', desc: 'Conveniently located near you' },
            ].map((item, i) => (
              <div key={i} className="text-center p-8 rounded-2xl bg-gray-50 hover:bg-navy-900 hover:text-white group transition-all duration-300">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-accent-100 rounded-2xl text-accent-600 group-hover:bg-accent-500 group-hover:text-white mb-6 transition-all">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-white transition-colors">{item.title}</h3>
                <p className="text-gray-500 group-hover:text-gray-300 transition-colors">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="section-heading text-navy-900">Frequently Asked Questions</h2>
          <p className="section-subheading">Find answers to common questions about our services</p>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-navy-900">{faq.q}</span>
                  <FiChevronDown className={`text-gray-400 transition-transform shrink-0 ml-4 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <div className={`px-6 text-gray-600 transition-all duration-300 overflow-hidden ${openFaq === i ? 'max-h-40 pb-4' : 'max-h-0'}`}>
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-navy-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-primary-500 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to Find Your Next Vehicle?</h2>
          <p className="text-gray-400 mb-8 text-lg max-w-2xl mx-auto">
            Create an account to start browsing, booking, and ordering from our wide selection of Japan surplus products.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/register" className="btn-accent btn-lg">Create Account</Link>
            <Link to="/products" className="btn-outline btn-lg">Browse Products</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
