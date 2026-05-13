import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const VISA_OPTIONS = ['US Citizen', 'Green Card', 'H1B', 'OPT', 'CPT', 'TN', 'L1']
const STATUS_OPTIONS = ['bench', 'submitted', 'interviewing', 'placed', 'upcoming']
const STATUS_COLORS = {
  bench: 'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  interviewing: 'bg-purple-100 text-purple-700',
  placed: 'bg-green-100 text-green-700',
  upcoming: 'bg-slate-100 text-slate-600',
}

const EMPTY_FORM = { name: '', email: '', phone: '', skills: '', visa_status: 'H1B', location: '', rate: '', experience: '', status: 'bench', notes: '' }

export default function Consultants() {
  const { user } = useAuth()
  const [consultants, setConsultants] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchConsultants() }, [])

  async function fetchConsultants() {
    const { data } = await supabase.from('consultants').select('*').order('created_at', { ascending: false })
    setConsultants(data || [])
  }

  async function handleSave() {
    setLoading(true)
    const payload = { ...form, user_id: user.id }
    if (editing) {
      await supabase.from('consultants').update(payload).eq('id', editing)
    } else {
      await supabase.from('consultants').insert(payload)
    }
    setForm(EMPTY_FORM)
    setEditing(null)
    setShowForm(false)
    setLoading(false)
    fetchConsultants()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this consultant?')) return
    await supabase.from('consultants').delete().eq('id', id)
    fetchConsultants()
  }

  function handleEdit(c) {
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', skills: c.skills, visa_status: c.visa_status, location: c.location, rate: c.rate, experience: c.experience || '', status: c.status, notes: c.notes || '' })
    setEditing(c.id)
    setShowForm(true)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Consultants</h2>
          <p className="text-slate-500 text-sm mt-1">{consultants.length} consultant{consultants.length !== 1 ? 's' : ''} on bench</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} /> Add Consultant
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-900">{editing ? 'Edit Consultant' : 'Add Consultant'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[['name', 'Full Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'text'], ['location', 'Location', 'text'], ['rate', 'Rate ($/hr)', 'number'], ['experience', 'Years of Experience', 'number']].map(([key, label, type]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Skills (comma separated)</label>
                <input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))}
                  placeholder="Java, Spring Boot, AWS, Microservices"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Visa Status</label>
                <select value={form.visa_status} onChange={e => setForm(f => ({ ...f, visa_status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {VISA_OPTIONS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={loading || !form.name || !form.skills}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                <Check size={14} /> {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {consultants.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p>No consultants yet. Add your first one.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Name', 'Skills', 'Visa', 'Location', 'Rate/hr', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consultants.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.experience ? `${c.experience} yrs exp` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    <p className="truncate">{c.skills}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.visa_status}</td>
                  <td className="px-4 py-3 text-slate-600">{c.location}</td>
                  <td className="px-4 py-3 text-slate-600">${c.rate}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(c)} className="text-slate-400 hover:text-indigo-600"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
