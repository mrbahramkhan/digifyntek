/**
 * DigiFyntek client RBAC helpers
 * Requires DigiFyntekAPI (js/api.js)
 */
(function (g) {
  async function loadMyPermissions() {
    const me = await DigiFyntekAPI.request('/api/v1/rbac/me');
    try {
      localStorage.setItem('DIGIFYNTEK_PERMS', JSON.stringify(me.permissions || []));
      localStorage.setItem('DIGIFYNTEK_ROLE', me.role || '');
    } catch (e) {}
    return me;
  }

  function hasPermission(perm) {
    try {
      const perms = JSON.parse(localStorage.getItem('DIGIFYNTEK_PERMS') || '[]');
      return perms.includes('*') || perms.includes(perm);
    } catch {
      return false;
    }
  }

  function currentRole() {
    return localStorage.getItem('DIGIFYNTEK_ROLE') || '';
  }

  g.DigiFyntekRBAC = { loadMyPermissions, hasPermission, currentRole };
})(typeof window !== 'undefined' ? window : this);
