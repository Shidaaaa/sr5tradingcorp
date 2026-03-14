require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Category = require('./models/Category');
const Product = require('./models/Product');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
    ]);
    console.log('Cleared existing data');

    // Create users
    const adminPass = await bcrypt.hash('admin123', 10);
    const customerPass = await bcrypt.hash('customer123', 10);

    const admin = await User.create({
      email: 'admin@sr5trading.com', password: adminPass,
      first_name: 'Admin', last_name: 'User', phone: '09171234567',
      address: '123 Admin St', city: 'Manila', role: 'admin',
    });

    const customer = await User.create({
      email: 'customer@test.com', password: customerPass,
      first_name: 'Juan', last_name: 'Dela Cruz', phone: '09181234567',
      address: '456 Customer Ave', city: 'Quezon City', role: 'customer',
    });

    console.log('Users created');

    // Create categories
    const cats = await Category.insertMany([
      { name: 'Trucks', description: 'Heavy-duty trucks for commercial use', type: 'vehicle' },
      { name: 'Tractors', description: 'Agricultural and industrial tractors', type: 'vehicle' },
      { name: 'Vans', description: 'Commercial and passenger vans', type: 'vehicle' },
      { name: 'Parts & Accessories', description: 'Vehicle parts and accessories', type: 'parts' },
      { name: 'Tools & Equipment', description: 'Industrial tools and equipment', type: 'tools' },
    ]);
    const catMap = {};
    cats.forEach(c => { catMap[c.name] = c._id; });
    console.log('Categories created');

    // Create products
    await Product.insertMany([
      // Trucks
      { name: 'Isuzu Forward FRR90', description: 'Medium-duty truck with 7.8L diesel engine. Ideal for logistics and cargo transport. GVW 11,000 kg.', price: 1850000, category_id: catMap['Trucks'], type: 'vehicle', stock_quantity: 1, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'trucks', image_url: '/images/truck1.jpg', specifications: '{"engine":"7.8L 4HK1","power":"240HP","transmission":"6-speed manual","gvw":"11,000 kg"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Hino 500 Series FC9J', description: 'Reliable medium-duty truck for city distribution. Euro 4 compliant.', price: 1650000, category_id: catMap['Trucks'], type: 'vehicle', stock_quantity: 1, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'trucks', image_url: '/images/truck2.jpg', specifications: '{"engine":"5.1L J05E","power":"210HP","transmission":"6-speed manual","gvw":"9,000 kg"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Mitsubishi Canter FE71', description: 'Light-duty truck perfect for small business deliveries. Fuel efficient.', price: 980000, category_id: catMap['Trucks'], type: 'vehicle', stock_quantity: 2, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'trucks', image_url: '/images/truck3.jpg', specifications: '{"engine":"3.0L 4M42","power":"110HP","transmission":"5-speed manual","gvw":"5,500 kg"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Sinotruk Howo A7', description: 'Heavy-duty 10-wheeler dump truck for mining and construction.', price: 3200000, category_id: catMap['Trucks'], type: 'vehicle', stock_quantity: 1, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'trucks', image_url: '/images/truck4.jpg', specifications: '{"engine":"9.7L WD615","power":"371HP","transmission":"10-speed manual","gvw":"25,000 kg"}', reorder_level: 1, max_reservation_days: 30 },
      // Tractors
      { name: 'Kubota L4508', description: '45HP utility tractor ideal for rice farming and land preparation.', price: 750000, category_id: catMap['Tractors'], type: 'vehicle', stock_quantity: 2, location: 'Equipment Yard', condition: 'good', status: 'available', vehicle_category: 'tractors', image_url: '/images/tractor1.jpg', specifications: '{"engine":"Kubota V2403","power":"45HP","transmission":"8F/4R","pto":"540 RPM"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'John Deere 5050D', description: '50HP agricultural tractor with power steering. Great for tillage.', price: 920000, category_id: catMap['Tractors'], type: 'vehicle', stock_quantity: 1, location: 'Equipment Yard', condition: 'good', status: 'available', vehicle_category: 'tractors', image_url: '/images/tractor2.jpg', specifications: '{"engine":"3-cyl diesel","power":"50HP","transmission":"8F/4R","pto":"540 RPM"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Mahindra 265 DI', description: 'Affordable 30HP tractor for small-scale farms and landscaping.', price: 480000, category_id: catMap['Tractors'], type: 'vehicle', stock_quantity: 1, location: 'Equipment Yard', condition: 'good', status: 'available', vehicle_category: 'tractors', image_url: '/images/tractor3.jpg', specifications: '{"engine":"2-cyl diesel","power":"30HP","transmission":"8F/2R","weight":"1,500 kg"}', reorder_level: 1, max_reservation_days: 30 },
      // Vans
      { name: 'Toyota HiAce Commuter', description: '15-seater van for passenger transport and shuttle services.', price: 1750000, category_id: catMap['Vans'], type: 'vehicle', stock_quantity: 1, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'vans', image_url: '/images/van1.jpg', specifications: '{"engine":"2.8L 1GD-FTV","power":"163HP","transmission":"6-speed AT","seats":"15"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Hyundai H-100', description: 'Cargo van perfect for local deliveries and small business logistics.', price: 870000, category_id: catMap['Vans'], type: 'vehicle', stock_quantity: 2, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'vans', image_url: '/images/van2.jpg', specifications: '{"engine":"2.6L D4BB","power":"80HP","transmission":"5-speed manual","payload":"1,000 kg"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Kia K2500', description: 'Versatile cargo van with 1.4-ton payload. Dual A/C option.', price: 950000, category_id: catMap['Vans'], type: 'vehicle', stock_quantity: 1, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'vans', image_url: '/images/van3.jpg', specifications: '{"engine":"2.5L WGT","power":"130HP","transmission":"6-speed manual","payload":"1,400 kg"}', reorder_level: 1, max_reservation_days: 30 },
      // Other Units
      { name: 'Caterpillar 320D Excavator', description: '20-ton hydraulic excavator for construction and mining.', price: 5500000, category_id: catMap['Tractors'], type: 'vehicle', stock_quantity: 1, location: 'Heavy Equipment Yard', condition: 'good', status: 'available', vehicle_category: 'other_units', image_url: '/images/excavator1.jpg', specifications: '{"engine":"Cat C6.4","power":"138HP","operating_weight":"20,000 kg","bucket":"0.8 m³"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Komatsu WA150 Wheel Loader', description: 'Compact wheel loader for material handling and loading.', price: 3800000, category_id: catMap['Tractors'], type: 'vehicle', stock_quantity: 1, location: 'Heavy Equipment Yard', condition: 'good', status: 'available', vehicle_category: 'other_units', image_url: '/images/loader1.jpg', specifications: '{"engine":"Komatsu SAA4D102E","power":"93HP","operating_weight":"8,500 kg","bucket":"1.5 m³"}', reorder_level: 1, max_reservation_days: 30 },
      { name: 'Forklift Toyota 8FD25', description: '2.5-ton diesel forklift for warehouse and dock operations.', price: 950000, category_id: catMap['Tractors'], type: 'vehicle', stock_quantity: 2, location: 'Main Yard', condition: 'good', status: 'available', vehicle_category: 'other_units', image_url: '/images/forklift1.jpg', specifications: '{"engine":"1DZ-III","power":"46HP","capacity":"2,500 kg","lift_height":"3.0 m"}', reorder_level: 1, max_reservation_days: 30 },
      // Parts & Accessories
      { name: 'Engine Oil 15W-40 (20L)', description: 'Heavy-duty diesel engine oil. Suitable for trucks and heavy equipment.', price: 3500, category_id: catMap['Parts & Accessories'], type: 'parts', stock_quantity: 50, location: 'Warehouse A', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/oil1.jpg', specifications: null, reorder_level: 10, max_reservation_days: 90 },
      { name: 'Air Filter Set - Isuzu NLR', description: 'Genuine replacement air filter set for Isuzu NLR series trucks.', price: 1200, category_id: catMap['Parts & Accessories'], type: 'parts', stock_quantity: 30, location: 'Warehouse A', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/filter1.jpg', specifications: null, reorder_level: 5, max_reservation_days: 90 },
      { name: 'Brake Pad Set - Universal Heavy Duty', description: 'Premium brake pads for trucks and heavy vehicles.', price: 2800, category_id: catMap['Parts & Accessories'], type: 'parts', stock_quantity: 25, location: 'Warehouse A', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/brakes1.jpg', specifications: null, reorder_level: 5, max_reservation_days: 90 },
      { name: 'Hydraulic Hose Assembly', description: 'High-pressure hydraulic hose for excavators and loaders.', price: 4500, category_id: catMap['Parts & Accessories'], type: 'parts', stock_quantity: 15, location: 'Warehouse B', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/hose1.jpg', specifications: null, reorder_level: 5, max_reservation_days: 90 },
      { name: 'Radiator - Mitsubishi Canter', description: 'Replacement radiator for Mitsubishi Canter FE series.', price: 8500, category_id: catMap['Parts & Accessories'], type: 'parts', stock_quantity: 8, location: 'Warehouse A', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/radiator1.jpg', specifications: null, reorder_level: 3, max_reservation_days: 90 },
      // Tools & Equipment
      { name: 'Hydraulic Floor Jack 20T', description: '20-ton hydraulic floor jack for heavy vehicle maintenance.', price: 15000, category_id: catMap['Tools & Equipment'], type: 'tools', stock_quantity: 10, location: 'Warehouse B', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/jack1.jpg', specifications: null, reorder_level: 3, max_reservation_days: 90 },
      { name: 'Impact Wrench Set', description: 'Pneumatic impact wrench set with metric sockets. Professional grade.', price: 12000, category_id: catMap['Tools & Equipment'], type: 'tools', stock_quantity: 8, location: 'Warehouse B', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/wrench1.jpg', specifications: null, reorder_level: 3, max_reservation_days: 90 },
      { name: 'Diagnostic Scanner OBD-II', description: 'Universal truck OBD-II diagnostic scanner. Supports J1939 protocol.', price: 25000, category_id: catMap['Tools & Equipment'], type: 'tools', stock_quantity: 5, location: 'Warehouse B', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/scanner1.jpg', specifications: null, reorder_level: 2, max_reservation_days: 90 },
      { name: 'Tire Changer Machine', description: 'Semi-automatic tire changer for truck and bus tires up to 26 inches.', price: 85000, category_id: catMap['Tools & Equipment'], type: 'tools', stock_quantity: 3, location: 'Warehouse B', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/tirechanger1.jpg', specifications: null, reorder_level: 1, max_reservation_days: 90 },
      { name: 'Welding Machine MIG 200A', description: 'MIG welding machine 200A. Suitable for body repair and fabrication.', price: 18000, category_id: catMap['Tools & Equipment'], type: 'tools', stock_quantity: 6, location: 'Warehouse B', condition: 'new', status: 'available', vehicle_category: null, image_url: '/images/welder1.jpg', specifications: null, reorder_level: 2, max_reservation_days: 90 },
    ]);
    console.log('Products created (23 items)');

    console.log('\nSeed completed successfully!');
    console.log('Admin: admin@sr5trading.com / admin123');
    console.log('Customer: customer@test.com / customer123');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
