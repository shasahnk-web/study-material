const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

let supabase = null;

function initSupabase() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

async function signUp(email, password, fullName) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
  
  return { data, error };
}

async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (!error && data.user) {
    const banData = await checkUserBan();
    if (banData && banData.is_active) {
      await supabase.auth.signOut();
      return { 
        error: { 
          message: `Your account has been suspended. Reason: ${banData.reason}${banData.ban_until ? ` Until: ${new Date(banData.ban_until).toLocaleDateString()}` : ' (Permanent)'}` 
        } 
      };
    }
    await trackVisit(data.user.id);
  }
  
  return { data, error };
}

async function signOut() {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.auth.signOut();
}

async function handleLogout() {
  await signOut();
  window.location.href = '/';
}

async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getUserProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_user_profile', { user_id: userId });
  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

async function updateProfile(updates) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  const user = await getCurrentUser();
  if (!user) return { error: { message: 'Not authenticated' } };
  
  return await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);
}

async function isAdmin() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('check_is_admin');
  if (error) {
    console.error('Error checking admin:', error);
    return false;
  }
  return data === true;
}

async function checkUserBan() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_user_ban_status');
  if (error) {
    console.error('Error checking ban:', error);
    return null;
  }
  return data;
}

async function getCategories() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });
  return data || [];
}

async function addCategory(name, slug, icon, description) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.from('categories').insert({
    name,
    slug,
    icon,
    description
  });
}

async function updateCategory(id, updates) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.from('categories').update(updates).eq('id', id);
}

async function deleteCategory(id) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.from('categories').delete().eq('id', id);
}

async function getMaterials() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('materials')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  return data || [];
}

async function getAllMaterials() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('materials')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}

async function addMaterial(title, description, imageUrl, telegramLink, category) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  const user = await getCurrentUser();
  
  return await supabase.from('materials').insert({
    title,
    description,
    image_url: imageUrl,
    telegram_link: telegramLink,
    category,
    created_by: user?.id,
    status: 'published'
  });
}

async function updateMaterial(id, updates) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.from('materials').update(updates).eq('id', id);
}

async function deleteMaterial(id) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.from('materials').delete().eq('id', id);
}

async function uploadImage(file, bucket = 'material-images') {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  
  const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file);
  
  if (error) return { error };
  
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);
  
  return { url: publicUrl };
}

async function uploadAvatar(file) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  const user = await getCurrentUser();
  if (!user) return { error: { message: 'Not authenticated' } };
  
  const fileName = `${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
  const { data, error } = await supabase.storage
    .from('profile-avatars')
    .upload(fileName, file, { upsert: true });
  
  if (error) return { error };
  
  const { data: { publicUrl } } = supabase.storage
    .from('profile-avatars')
    .getPublicUrl(fileName);
  
  await updateProfile({ avatar_url: publicUrl });
  
  return { url: publicUrl };
}

async function getAllUsers() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_all_users_admin');
  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }
  return data || [];
}

async function updateUserRole(userId, role) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  return await supabase.from('profiles').update({ role }).eq('id', userId);
}

async function banUser(userId, reason, banType, duration = null) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  const admin = await getCurrentUser();
  
  let banUntil = null;
  if (banType === 'temporary' && duration) {
    banUntil = new Date();
    banUntil.setDate(banUntil.getDate() + parseInt(duration));
    banUntil = banUntil.toISOString();
  }
  
  const { error } = await supabase.from('user_bans').insert({
    user_id: userId,
    banned_by: admin?.id,
    reason: reason,
    ban_type: banType,
    ban_until: banUntil,
    is_active: true
  });
  
  if (!error) {
    await supabase.from('profiles').update({ is_banned: true }).eq('id', userId);
  }
  
  return { error };
}

async function unbanUser(userId) {
  if (!supabase) return { error: { message: 'Supabase not configured' } };
  
  await supabase
    .from('user_bans')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);
  
  return await supabase.from('profiles').update({ is_banned: false }).eq('id', userId);
}

async function getUserBanHistory(userId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('user_bans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

async function trackVisit(userId = null) {
  if (!supabase) return;
  await supabase.from('site_visits').insert({
    user_id: userId,
    page_path: window.location.pathname,
    visited_at: new Date().toISOString()
  });
}

async function getVisitStats() {
  if (!supabase) return { total: 0, today: 0, thisWeek: 0 };
  
  const { data: allVisits } = await supabase
    .from('site_visits')
    .select('*');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const total = allVisits?.length || 0;
  const todayVisits = allVisits?.filter(v => new Date(v.visited_at) >= today).length || 0;
  const weekVisits = allVisits?.filter(v => new Date(v.visited_at) >= weekAgo).length || 0;
  
  return { total, today: todayVisits, thisWeek: weekVisits };
}

window.initSupabase = initSupabase;
window.signUp = signUp;
window.signIn = signIn;
window.signOut = signOut;
window.handleLogout = handleLogout;
window.getCurrentUser = getCurrentUser;
window.getUserProfile = getUserProfile;
window.updateProfile = updateProfile;
window.isAdmin = isAdmin;
window.checkUserBan = checkUserBan;
window.getCategories = getCategories;
window.addCategory = addCategory;
window.updateCategory = updateCategory;
window.deleteCategory = deleteCategory;
window.getMaterials = getMaterials;
window.getAllMaterials = getAllMaterials;
window.addMaterial = addMaterial;
window.updateMaterial = updateMaterial;
window.deleteMaterial = deleteMaterial;
window.uploadImage = uploadImage;
window.uploadAvatar = uploadAvatar;
window.getAllUsers = getAllUsers;
window.updateUserRole = updateUserRole;
window.banUser = banUser;
window.unbanUser = unbanUser;
window.getUserBanHistory = getUserBanHistory;
window.trackVisit = trackVisit;
window.getVisitStats = getVisitStats;
