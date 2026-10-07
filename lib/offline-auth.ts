export interface CachedUser {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'worker';
  cachedAt: number;
}

export function cacheUserForOffline(user: { _id: string; email: string; name: string; role: 'owner' | 'worker' }): void {
  const data: CachedUser = {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    cachedAt: Date.now()
  };
  localStorage.setItem('offline_user', JSON.stringify(data));
}

export function getOfflineUser(): CachedUser | null {
  try {
    const cached = localStorage.getItem('offline_user');
    if (!cached) return null;
    const user = JSON.parse(cached) as CachedUser;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - user.cachedAt > sevenDays) return null;
    return user;
  } catch {
    return null;
  }
}

export function canLoginOffline(): boolean {
  return !!getOfflineUser();
}