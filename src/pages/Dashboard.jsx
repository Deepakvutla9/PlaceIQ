import { useEffect, useState } from 'react'
import { Users, Briefcase, TrendingUp, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, placed: 0, interviewing: 0 })

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('consultants').select('status')
      if (!data) return
      setStats({
        total: data.length,
        active: data.filter(c => c.status === 'bench').length,
        placed: data.filter(c => c.status === 'placed').length,
        interviewing: data.filter(c => c.status === 'interviewing').length,
      })
    }
    load()
  }, [])

  const cards = [
    { label: 'Total Consultants', value: stats.total, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'On Bench', value: stats.active, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Interviewing', value: stats.interviewing, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Placed', value: stats.placed, icon: Briefcase, color: 'text-green-600', bg: 'bg-green-50' },
  ]

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h2>
      <p className="text-slate-500 text-sm mb-8">Overview of your bench pipeline</p>

      <div className="grid grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-2">Getting Started</h3>
        <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
          <li>Add your bench consultants in the <strong>Consultants</strong> tab</li>
          <li>Go to <strong>AI Matcher</strong> and paste a job requirement</li>
          <li>Get instant AI-powered match scores for all consultants</li>
          <li>Submit the best match to the vendor with one click</li>
        </ol>
      </div>
    </div>
  )
}
