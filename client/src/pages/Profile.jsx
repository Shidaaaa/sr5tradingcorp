import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiUser, FiLock, FiSave } from 'react-icons/fi';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', address: '', city: '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    if (user) setForm({ first_name: user.first_name, last_name: user.last_name, phone: user.phone || '', address: user.address || '', city: user.city || '' });
  }, [user]);

  const handleProfile = async (e) => {
    e.preventDefault();
    try {
      const data = await api.updateProfile(form);
      updateUser(data.user);
      toast.success('Profile updated!');
    } catch (err) { toast.error(err.message); }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) { toast.error('Passwords do not match'); return; }
    try {
      await api.changePassword(passwordForm);
      toast.success('Password changed!');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">My Profile</h1>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('profile')} className={`px-4 py-2 rounded-lg font-medium text-sm ${tab === 'profile' ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <FiUser className="inline mr-1" /> Profile
        </button>
        <button onClick={() => setTab('password')} className={`px-4 py-2 rounded-lg font-medium text-sm ${tab === 'password' ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <FiLock className="inline mr-1" /> Password
        </button>
      </div>

      {tab === 'profile' ? (
        <form onSubmit={handleProfile} className="card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">First Name</label><input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">Last Name</label><input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Email</label><input value={user?.email || ''} className="input-field bg-gray-50" disabled /></div>
          <div><label className="block text-sm font-medium mb-1">Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm font-medium mb-1">Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm font-medium mb-1">City</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input-field" /></div>
          <button type="submit" className="btn-primary flex items-center gap-1"><FiSave /> Save Changes</button>
        </form>
      ) : (
        <form onSubmit={handlePassword} className="card p-6 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Current Password</label><input type="password" value={passwordForm.current_password} onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium mb-1">New Password</label><input type="password" value={passwordForm.new_password} onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium mb-1">Confirm New Password</label><input type="password" value={passwordForm.confirm_password} onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })} className="input-field" required /></div>
          <button type="submit" className="btn-primary flex items-center gap-1"><FiLock /> Change Password</button>
        </form>
      )}
    </div>
  );
}
