const Cloud = (() => {
  const cfg = window.LESEMAUS_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '')
    && !!cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('DEIN');
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  let user = null;

  const must = ({ data, error }) => { if (error) throw error; return data; };

  async function restore() {
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    return user;
  }

  async function signUp(email, password) {
    const options = location.protocol.startsWith('http') ? { emailRedirectTo: location.origin + location.pathname } : undefined;
    const d = must(await sb.auth.signUp({ email, password, options }));
    user = d.session?.user || null;
    return { needsConfirm: !d.session };
  }

  async function signIn(email, password) {
    user = must(await sb.auth.signInWithPassword({ email, password })).user;
    return user;
  }

  async function signOut() {
    await sb.auth.signOut();
    user = null;
  }

  const fetchMe = async () => must(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
  const insertMe = async (row) => must(await sb.from('profiles').insert({ id: user.id, ...row }).select().single());
  const updateMe = async (row) => must(await sb.from('profiles').update(row).eq('id', user.id));
  const deleteMe = async () => must(await sb.from('profiles').delete().eq('id', user.id));

  async function fetchGroup() {
    const [groups, profiles] = await Promise.all([
      sb.from('groups').select('id,name,invite_code').then(must),
      sb.from('profiles').select('*').then(must),
    ]);
    return { group: groups[0] || null, profiles };
  }

  const createGroup = async (name) => must(await sb.rpc('create_group', { group_name: name }));
  const joinGroup = async (code) => must(await sb.rpc('join_group', { code }));
  const leaveGroup = async () => must(await sb.rpc('leave_group'));

  return {
    configured: !!sb, user: () => user, restore, signUp, signIn, signOut,
    fetchMe, insertMe, updateMe, deleteMe, fetchGroup, createGroup, joinGroup, leaveGroup,
  };
})();
