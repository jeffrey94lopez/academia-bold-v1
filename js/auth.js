import { supabase } from './supabase.js'

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    showLogin()
    return false
  }
  return true
}

export function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden')
  document.getElementById('adminApp').classList.add('hidden')

  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('loginEmail').value
    const password = document.getElementById('loginPassword').value
    const errEl = document.getElementById('loginError')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      errEl.textContent = 'Credenciales incorrectas'
      errEl.classList.remove('hidden')
    } else {
      location.reload()
    }
  })
}

export async function logout() {
  await supabase.auth.signOut()
  location.href = 'index.html'
}
