import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Bell, Plus, Trash2, Shield, User, Globe, Clock, Loader2, X, CheckCheck } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { fetchNotifications, createNotification, removeNotification, markAsRead, markAllAsRead } from "../../redux/slice/notificationSlice";
import { useMagicToast } from "../../context/MagicToastContext";

export default function Notifications() {
  const dispatch = useDispatch();
  const { showToast } = useMagicToast();
  const { list, loading } = useSelector((state) => state.notifications);
  const currentUserRole = (localStorage.getItem("role") || "").toLowerCase();
  const currentUsername = (localStorage.getItem("user-name") || "Admin");
  const currentUserId = localStorage.getItem("user-id");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    roleTarget: "all",
  });

  const isAdmin = currentUserRole === "admin";

  useEffect(() => {
    if (currentUserRole) {
      dispatch(fetchNotifications({ role: currentUserRole, userId: currentUserId }));
    }
  }, [dispatch, currentUserRole, currentUserId]);

  // Mark all unread notifications as read automatically when visiting this page
  useEffect(() => {
    if (list && list.length > 0 && currentUserId) {
      const unreadIds = list.filter(n => !n.isRead).map(n => n.id);
      if (unreadIds.length > 0) {
        dispatch(markAllAsRead({ notificationIds: unreadIds, userId: currentUserId }));
      }
    }
  }, [dispatch, list, currentUserId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.message) {
      showToast("Please fill all fields", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        createNotification({
          ...formData,
          createdBy: currentUserId || null,
        })
      ).unwrap();
      showToast("Notification created successfully", "success");
      setIsModalOpen(false);
      setFormData({ title: "", message: "", roleTarget: "all" });
    } catch (err) {
      showToast(err || "Failed to create notification", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this notification?")) return;
    try {
      await dispatch(removeNotification(id)).unwrap();
      showToast("Notification deleted", "success");
    } catch (err) {
      showToast("Failed to delete notification", "error");
    }
  };

  const handleMarkAsRead = (notificationId, isRead) => {
    if (!isRead && currentUserId) {
      dispatch(markAsRead({ notificationId, userId: currentUserId }));
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              <div className="relative">
                <Bell className="text-purple-600" size={32} />
                {list.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full flex items-center justify-center animate-bounce">
                    <span className="text-[8px] text-white font-black">{list.filter(n => !n.isRead).length}</span>
                  </span>
                )}
              </div>
              Notifications <span className="text-purple-600">Hub</span>
              {list.filter(n => !n.isRead).length > 0 && (
                <span className="ml-2 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-black animate-pulse uppercase tracking-widest">
                  {list.filter(n => !n.isRead).length} New
                </span>
              )}
            </h1>
            <p className="text-gray-500 mt-2 font-medium">Stay updated with system-wide announcements and targeted alerts.</p>
          </div>
          <div className="flex items-center gap-3">
             {isAdmin && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-purple-200 transition-all active:scale-95"
              >
                <Plus size={20} /> Create Announcement
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
              <Loader2 className="animate-spin text-purple-600 mb-4" size={48} />
              <p className="font-bold text-gray-400">Loading notifications...</p>
            </div>
          ) : list.length === 0 ? (
            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-12 border border-gray-100 text-center shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <Bell size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">No notifications yet</h3>
              <p className="text-gray-500">When announcements are made, they will appear here.</p>
            </div>
          ) : (
            list.map((noti) => (
              <div
                key={noti.id}
                onMouseEnter={() => handleMarkAsRead(noti.id, noti.isRead)}
                className={`group bg-white rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden ${
                  noti.isRead ? 'border-gray-100 opacity-80' : 'border-purple-200 shadow-xl shadow-purple-50'
                }`}
              >
                <div className={`absolute top-0 left-0 w-2 h-full transition-opacity ${
                  noti.isRead ? 'bg-gray-200 opacity-0 group-hover:opacity-100' : 'bg-purple-600'
                }`} />
                
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                       {!noti.isRead && (
                         <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" title="Unread" />
                       )}
                       <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                         noti.role_target === 'all' ? 'bg-blue-50 text-blue-600' : 
                         noti.role_target === 'admin' ? 'bg-purple-50 text-purple-600' :
                         noti.role_target === 'superadmin' ? 'bg-red-50 text-red-600 border border-red-100' :
                         'bg-orange-50 text-orange-600'
                       }`}>
                         {noti.role_target === 'all' ? <Globe size={10} /> : <Shield size={10} />}
                         {noti.role_target}
                       </span>
                       <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                         <Clock size={10} />
                         {new Date(noti.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                       </span>
                       {noti.isRead && (
                         <span className="text-[10px] font-bold text-green-500 flex items-center gap-1 ml-auto">
                           <CheckCheck size={12} /> Read
                         </span>
                       )}
                    </div>
                    <h3 className={`text-xl font-black mb-2 transition-colors uppercase tracking-tight ${
                      noti.isRead ? 'text-gray-500' : 'text-gray-900 group-hover:text-purple-600'
                    }`}>{noti.title}</h3>
                    <p className={`leading-relaxed font-medium text-sm mb-4 ${
                      noti.isRead ? 'text-gray-400' : 'text-gray-600'
                    }`}>{noti.message}</p>
                    
                    {/* Author Info */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                      <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden border border-gray-200">
                        {noti.creator?.profile_image ? (
                          <img src={noti.creator.profile_image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-purple-100 text-purple-600">
                            <User size={12} />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-gray-400">
                        Posted by {noti.creator?.user_name || "Admin"}
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(noti.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create Modal - Matching provided UI style */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-300" onClick={() => !isSubmitting && setIsModalOpen(false)} />
            <div className="relative bg-[#fcfcfc] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
              
              <div className="p-8 pb-4">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Details</h2>
                
                <form onSubmit={handleCreate} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Type here"
                      className="w-full px-4 py-3 bg-white border border-gray-100 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-sm text-gray-600 placeholder:text-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                    <textarea
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows="5"
                      placeholder="Type here"
                      className="w-full px-4 py-3 bg-white border border-gray-100 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-sm text-gray-600 placeholder:text-gray-300 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Target Role</label>
                    <select
                      value={formData.roleTarget}
                      onChange={(e) => setFormData({ ...formData, roleTarget: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-100 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-sm text-gray-600 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.67%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_12px_center] bg-no-repeat"
                    >
                      <option value="all">Global (All Users)</option>
                      <option value="superadmin">Superadmin Only</option>
                      <option value="admin">Admin Only</option>
                      <option value="hod">HODs Only</option>
                      <option value="user">Users Only</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 pb-4 border-t border-gray-100 px-0 -mx-0">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-6 py-2.5 rounded-lg text-sm font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-2.5 bg-[#6333ea] hover:bg-[#5229c7] text-white rounded-lg font-bold text-sm shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : "Save Notification"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
