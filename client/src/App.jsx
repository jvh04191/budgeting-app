import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const moneyPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const CATEGORIES = ['Groceries', 'Dining out', 'Transport', 'Leisure', 'Rent & bills', 'Other']
const ICON_STROKE = 1.75

function formatMoney(cents, precise = false) {
  return (precise ? moneyPrecise : money).format((Number(cents) || 0) / 100)
}

function formatSigned(cents, type) {
  const value = formatMoney(cents, Number(cents) % 100 !== 0)
  return type === 'income' ? `+${value}` : `−${value}`
}

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function currentMonth() {
  return localDate().slice(0, 7)
}

function monthLabel(month, style = 'long') {
  if (!month) return ''
  const [year, value] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, value - 1, 1)),
  )
}

function daysRemaining(month) {
  if (month !== currentMonth()) return 0
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(1, last - now.getDate() + 1)
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

function applyKey(value, key) {
  if (key === 'back') return value.length <= 1 ? '0' : value.slice(0, -1)
  if (value === '0' && key === '00') return value
  const next = value === '0' ? key : `${value}${key}`
  return next.length > 9 ? value : next
}

function Icon({ name, size = 24, className = '' }) {
  const paths = {
    today: <><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9M10 19v-5h4v5"/></>,
    budgets: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M15 9.5c-.7-1.4-5-1.3-5 .8 0 2.6 5 1.2 5 3.7 0 2.1-4.3 2.2-5 .8"/></>,
    insights: <><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3.5 19.5h17"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.6l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7l-.7-2h-3l-.7 2a7 7 0 0 0-1.6.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.6l-2 .7v3l2 .7a7 7 0 0 0 .7 1.6l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.6.7l.7 2h3l.7-2a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.6z"/></>,
    coffee: <><path d="M5 8h11v5.5A4.5 4.5 0 0 1 11.5 18h-2A4.5 4.5 0 0 1 5 13.5z"/><path d="M16 10h1.5a2 2 0 0 1 0 4H16M7 5.5c1-1 0-2 1-3M11 5.5c1-1 0-2 1-3"/></>,
    cart: <><path d="M3 5h2l1.5 9h10.8l2-6.5H6"/><circle cx="9" cy="18" r="1"/><circle cx="17" cy="18" r="1"/></>,
    income: <><path d="M12 4v13M7 9l5-5 5 5"/><path d="M5 20h14"/></>,
    receipt: <><path d="M7 3h10v18l-2.5-1.8L12 21l-2.5-1.8L7 21z"/><path d="M10 8h4M10 12h4M10 16h2"/></>,
    backspace: <><path d="M9 7h11v10H9l-5-5z"/><path d="m12 10 4 4m0-4-4 4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    bank: <><path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 19.5h17"/></>,
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Segmented({ options, value, onChange, label }) {
  return <div className="segmented" role="group" aria-label={label}>
    {options.map((option) => <button key={option} type="button" className={value === option ? 'active' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}
  </div>
}

function Progress({ value, warn = false, label }) {
  return <div className={`progress-track ${warn ? 'warn' : ''}`} role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(clamp(value))}>
    <span className="progress-fill" style={{ '--progress': `${clamp(value)}%` }} />
  </div>
}

function EmptyState({ title, message, action, onAction }) {
  return <div className="empty-state">
    <span className="empty-icon"><Icon name="receipt" /></span>
    <h3>{title}</h3>
    <p>{message}</p>
    {action && <button type="button" className="text-button" onClick={onAction}>{action}</button>}
  </div>
}

function ErrorBanner({ message, onRetry }) {
  return <div className="error-banner" role="alert">
    <span>{message}</span>
    <button type="button" onClick={onRetry}>Try again</button>
  </div>
}

function BudgetRows({ budgets, limit = budgets.length, onSelect }) {
  return <div className="budget-rows">
    {budgets.slice(0, limit).map((budget) => {
      const used = budget.limit_cents ? (budget.spent_cents / budget.limit_cents) * 100 : 0
      const warn = used >= 90
      const inner = <>
        <div className="row-main">
          <span className="row-title">{budget.category}</span>
          <span className={`row-amount ${warn ? 'warning-text' : ''}`}>
            {warn && budget.remaining_cents > 0 ? `${formatMoney(budget.remaining_cents)} left` : `${formatMoney(budget.spent_cents)} of ${formatMoney(budget.limit_cents)}`}
          </span>
        </div>
        <Progress value={used} warn={warn} label={`${budget.category}: ${Math.round(used)} percent used`} />
      </>
      const key = budget.id ?? `${budget.category}-${budget.month}`
      return onSelect
        ? <button type="button" className="budget-row row-button" key={key} onClick={() => onSelect(budget)} aria-label={`Edit ${budget.category} budget`}>{inner}</button>
        : <div className="budget-row" key={key}>{inner}</div>
    })}
  </div>
}

function TodayScreen({ data, loading, error, retry, onNavigate, onAdd, onEditBudget, onOpenAccounts }) {
  const { summary, budgets, transactions, month, items } = data
  const linkedAccounts = items.flatMap((item) => item.accounts)
  const totalBudget = budgets.reduce((sum, item) => sum + item.limit_cents, 0)
  const spent = Number(summary?.expense_cents) || 0
  const left = Math.max(0, totalBudget - spent)
  const remainingDays = daysRemaining(month)
  const perDay = remainingDays ? Math.floor(left / remainingDays) : 0
  const used = totalBudget ? (spent / totalBudget) * 100 : 0

  return <main id="main-content" className="screen today-screen" tabIndex="-1">
    <header className="month-header">
      <h1>{monthLabel(month)}</h1>
      <button className="icon-button" type="button" aria-label="Linked accounts" onClick={onOpenAccounts}><Icon name="settings" /></button>
    </header>
    {error && <ErrorBanner message={error} onRetry={retry} />}
    <section className="hero" aria-labelledby="left-title">
      <p id="left-title" className="eyebrow">Left to spend</p>
      <p className="hero-number">{formatMoney(left)}</p>
      <p className="hero-meta">of {formatMoney(totalBudget)} · {remainingDays} {remainingDays === 1 ? 'day' : 'days'} left</p>
      <Progress value={used} warn={used >= 90} label={`Overall budget: ${Math.round(used)} percent used`} />
      <div className="hero-detail"><span>{formatMoney(spent)} spent</span><span>{formatMoney(perDay)} a day</span></div>
    </section>

    <section className="card section-card" aria-labelledby="today-budgets">
      <div className="card-heading"><h2 id="today-budgets">Budgets</h2><button className="text-button" type="button" onClick={() => onNavigate('budgets')}>See all</button></div>
      {loading ? <div className="loading-lines" aria-label="Loading budgets"><span/><span/><span/></div> : budgets.length ? <BudgetRows budgets={budgets} limit={3} /> : <EmptyState title="No budgets yet" message="Add a monthly budget to see what is left each day." action="Set a budget" onAction={() => onEditBudget(null)} />}
    </section>

    {linkedAccounts.length > 0 && <section className="card section-card" aria-labelledby="today-accounts">
      <div className="card-heading"><h2 id="today-accounts">Accounts</h2><button className="text-button" type="button" onClick={onOpenAccounts}>Manage</button></div>
      <div className="account-list">{linkedAccounts.slice(0, 3).map((account) => <AccountRow key={account.account_id} account={account} />)}</div>
    </section>}

    <section className="card section-card recent-card" aria-labelledby="recent-title">
      <div className="card-heading"><h2 id="recent-title">Recent</h2></div>
      {loading ? <div className="loading-lines" aria-label="Loading recent entries"><span/><span/><span/></div> : transactions.length ? <div className="transaction-list">
        {transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
      </div> : <EmptyState title="Nothing here yet" message="Your latest expenses and income will appear here." action="Add an entry" onAction={onAdd} />}
    </section>
  </main>
}

function TransactionRow({ transaction }) {
  const isIncome = transaction.type === 'income'
  const description = transaction.description || transaction.category
  const icon = isIncome ? 'income' : /coffee|café/i.test(description) ? 'coffee' : /grocery|food|market/i.test(transaction.category) ? 'cart' : 'receipt'
  return <div className="transaction-row">
    <span className={`transaction-icon ${isIncome ? 'income' : ''}`}><Icon name={icon} size={21} /></span>
    <div className="transaction-copy"><span className="row-title">{description}</span><span className="transaction-meta">{transaction.category} · {formatTransactionDate(transaction.date)}{transaction.pending ? ' · Pending' : ''}</span></div>
    <span className={`transaction-amount ${isIncome ? 'positive' : ''}`}>{formatSigned(transaction.amount_cents, transaction.type)}</span>
  </div>
}

function formatTransactionDate(date) {
  if (date === localDate()) return 'Today'
  const parsed = new Date(`${date}T12:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed)
}

function Ring({ value, left, total }) {
  const radius = 73
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamp(value) / 100)
  return <div className="ring-wrap">
    <svg className="ring" width="168" height="168" viewBox="0 0 168 168" role="img" aria-label={`${Math.round(clamp(value))} percent of budget used`}>
      <circle className="ring-track" cx="84" cy="84" r={radius}/>
      <circle className={`ring-value ${value >= 90 ? 'warn' : ''}`} cx="84" cy="84" r={radius} style={{ '--ring-offset': offset, '--ring-length': circumference }}/>
    </svg>
    <div className="ring-copy"><strong>{formatMoney(left)}</strong><span>left of {formatMoney(total)}</span></div>
  </div>
}

function BudgetsScreen({ data, loading, error, retry, onEditBudget }) {
  const [period, setPeriod] = useState('Monthly')
  const { budgets } = data
  const total = budgets.reduce((sum, item) => sum + item.limit_cents, 0)
  const spent = budgets.reduce((sum, item) => sum + item.spent_cents, 0)
  const left = Math.max(0, total - spent)
  const used = total ? (spent / total) * 100 : 0
  return <main id="main-content" className="screen" tabIndex="-1">
    <h1 className="large-title">Budgets</h1>
    <Segmented options={['Monthly', 'Weekly']} value={period} onChange={setPeriod} label="Budget period" />
    {period === 'Weekly' && <p className="period-note">Weekly view uses this month’s category totals.</p>}
    {error && <ErrorBanner message={error} onRetry={retry} />}
    <section className="budget-overview" aria-label="Budget overview">
      <Ring value={used} left={left} total={total} />
    </section>
    <section className="card budgets-list" aria-labelledby="category-budgets">
      <div className="card-heading list-heading"><h2 id="category-budgets">Categories</h2><button className="text-button" type="button" onClick={() => onEditBudget(null)}>Set budget</button></div>
      {loading ? <div className="loading-lines" aria-label="Loading budgets"><span/><span/><span/><span/></div> : budgets.length ? <BudgetRows budgets={budgets} onSelect={onEditBudget} /> : <EmptyState title="Set your first budget" message="Category limits turn your monthly spending into a clear daily plan." action="Set a budget" onAction={() => onEditBudget(null)} />}
    </section>
  </main>
}

function AddScreen({ onCancel, onSaved }) {
  const [typeLabel, setTypeLabel] = useState('Expense')
  const [digits, setDigits] = useState('0')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [date, setDate] = useState(localDate())
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const noteRef = useRef(null)
  const cents = Number(digits)

  const keyPress = (key) => setDigits((value) => applyKey(value, key))

  const save = async () => {
    if (!cents) return setError('Enter an amount greater than $0.00.')
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: typeLabel.toLowerCase(), amount_cents: cents, category, description: description.trim(), date }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'The entry could not be saved.')
      }
      onSaved()
    } catch (reason) {
      setError(`${reason.message} Check that the API is running, then try again.`)
    } finally {
      setSaving(false)
    }
  }

  return <main id="main-content" className="add-screen" tabIndex="-1">
    <header className="modal-header"><button type="button" className="cancel-button" onClick={onCancel}>Cancel</button><h1>New entry</h1><span aria-hidden="true" /></header>
    <Segmented options={['Expense', 'Income']} value={typeLabel} onChange={setTypeLabel} label="Entry type" />
    <section className="amount-entry" aria-label={`${typeLabel} amount`}><p>{formatMoney(cents, true)}</p><span>from Everyday account</span></section>
    <div className="category-chips" aria-label="Category">
      {CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <div className="form-group">
      <label className="form-row"><span>Date</span><span className="date-control">{date === localDate() ? 'Today' : formatTransactionDate(date)}<input type="date" value={date} max="9999-12-31" onChange={(event) => setDate(event.target.value)} aria-label="Entry date" /></span></label>
      <label className="form-row"><span>Note</span><input ref={noteRef} type="text" value={description} maxLength="80" onChange={(event) => setDescription(event.target.value)} placeholder="Add a note" aria-label="Note" /></label>
    </div>
    <NumberPad onKey={keyPress} />
    {error && <p className="save-error" role="alert">{error}</p>}
    <button type="button" className="primary-button" onClick={save} disabled={saving}>{saving ? 'Saving…' : `Save ${typeLabel.toLowerCase()}`}</button>
  </main>
}

function NumberPad({ onKey }) {
  return <div className="number-pad" role="group" aria-label="Number pad">
    {['1','2','3','4','5','6','7','8','9','00','0'].map((key) => <button type="button" key={key} onClick={() => onKey(key)} aria-label={key === '00' ? 'double zero' : key}>{key}</button>)}
    <button type="button" onClick={() => onKey('back')} aria-label="Delete last digit"><Icon name="backspace" size={27}/></button>
  </div>
}

function BudgetEditor({ budgets, month, initialCategory, onCancel, onSaved }) {
  const existingFor = (name) => budgets.find((item) => item.category === name)
  const [category, setCategory] = useState(initialCategory || CATEGORIES.find((name) => !existingFor(name)) || CATEGORIES[0])
  const [digits, setDigits] = useState(() => String(existingFor(initialCategory || '')?.limit_cents || 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const cents = Number(digits)
  const existing = existingFor(category)

  const pickCategory = (name) => {
    setCategory(name)
    setDigits(String(existingFor(name)?.limit_cents || 0))
    setError('')
  }

  const request = async (path, options, failure) => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(path, options)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || failure)
      }
      onSaved()
    } catch (reason) {
      setError(`${reason.message} Check that the API is running, then try again.`)
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    if (!cents) return setError('Enter a budget greater than $0.00.')
    request('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, month, limit_cents: cents }),
    }, 'The budget could not be saved.')
  }

  const remove = () => request(`/api/budgets/${existing.id}`, { method: 'DELETE' }, 'The budget could not be removed.')

  return <main id="main-content" className="add-screen" tabIndex="-1">
    <header className="modal-header"><button type="button" className="cancel-button" onClick={onCancel}>Cancel</button><h1>Set budget</h1><span aria-hidden="true" /></header>
    <section className="amount-entry" aria-label="Monthly budget amount"><p>{formatMoney(cents, true)}</p><span>for {category} in {monthLabel(month)}</span></section>
    <div className="category-chips" role="group" aria-label="Category">
      {CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => pickCategory(item)}>{item}</button>)}
    </div>
    <NumberPad onKey={(key) => setDigits((value) => applyKey(value, key))} />
    {error && <p className="save-error" role="alert">{error}</p>}
    <button type="button" className="primary-button" onClick={save} disabled={saving}>{saving ? 'Saving…' : existing ? 'Update budget' : 'Save budget'}</button>
    {existing && <button type="button" className="danger-button" onClick={remove} disabled={saving}>Remove budget</button>}
  </main>
}

function InsightsScreen({ data, loading, error, retry }) {
  const [period, setPeriod] = useState('Month')
  const { summary, month } = data
  const expense = Number(summary?.expense_cents) || 0
  const trend = summary?.trend || []
  const previous = trend.length > 1 ? Number(trend[trend.length - 2]?.expense_cents) || 0 : 0
  const difference = previous ? Math.round(Math.abs(expense - previous) / previous * 100) : 0
  const comparison = previous ? `${difference}% ${expense <= previous ? 'less' : 'more'} than ${monthLabel(trend[trend.length - 2]?.month)}` : 'No prior month to compare'
  const categories = summary?.by_category || []
  const categoryTotal = categories.reduce((sum, item) => sum + item.total_cents, 0)
  const maxTrend = Math.max(1, ...trend.map((item) => item.expense_cents))
  const colors = ['var(--accent)', 'var(--accent-mid)', 'var(--chart-gray)', 'var(--chart-gray-light)']
  const topCategories = categories.slice(0, 4)

  return <main id="main-content" className="screen insights-screen" tabIndex="-1">
    <h1 className="large-title">Insights</h1>
    <Segmented options={['Week', 'Month', 'Year']} value={period} onChange={setPeriod} label="Insights period" />
    {error && <ErrorBanner message={error} onRetry={retry} />}
    <section className="card summary-card" aria-labelledby="spent-title">
      <p id="spent-title" className="eyebrow">Spent in {monthLabel(month)}</p>
      <p className="big-stat">{formatMoney(expense)}</p>
      <p className={`comparison ${previous && expense > previous ? 'warning-text' : ''}`}>{comparison}</p>
      {loading ? <div className="chart-skeleton" aria-label="Loading spending trend" /> : trend.some((item) => item.expense_cents > 0) ? <>
        <div className="bar-chart" aria-hidden="true">
          {trend.map((item, index) => <div className="bar-column" key={item.month}><span className={index === trend.length - 1 ? 'current' : ''} style={{ '--bar-scale': Math.max(.03, item.expense_cents / maxTrend) }}/><small className={index === trend.length - 1 ? 'current' : ''}>{monthLabel(item.month, 'short')}</small></div>)}
        </div>
        <p className="sr-only">Six-month spending: {trend.map((item) => `${monthLabel(item.month)} ${formatMoney(item.expense_cents)}`).join(', ')}.</p>
      </> : <EmptyState title="No spending trend yet" message="Add an expense to begin your six-month view." />}
    </section>
    <section className="card where-card" aria-labelledby="where-title">
      <h2 id="where-title">Where it went</h2>
      {loading ? <div className="loading-lines" aria-label="Loading category breakdown"><span/><span/><span/></div> : categoryTotal ? <>
        <div className="stacked-bar" role="img" aria-label={topCategories.map((item) => `${item.category} ${Math.round(item.total_cents / categoryTotal * 100)} percent`).join(', ')}>
          {topCategories.map((item, index) => <span key={item.category} style={{ width: `${item.total_cents / categoryTotal * 100}%`, background: colors[index] }}/>) }
        </div>
        <div className="legend">
          {topCategories.map((item, index) => <div className="legend-row" key={item.category}><span className="legend-dot" style={{ background: colors[index] }}/><span>{item.category}</span><strong>{Math.round(item.total_cents / categoryTotal * 100)}%</strong></div>)}
        </div>
      </> : <EmptyState title="No categories to show" message="Your spending breakdown will appear after your first expense." />}
    </section>
  </main>
}

function AccountRow({ account }) {
  const liability = account.type === 'credit' || account.type === 'loan'
  const balance = account.current_cents ?? 0
  const detail = [account.subtype || account.type, account.mask && `•••• ${account.mask}`].filter(Boolean).join(' · ')
  return <div className="account-row">
    <span className="transaction-icon"><Icon name="bank" size={21} /></span>
    <div className="transaction-copy"><span className="row-title">{account.name}</span><span className="transaction-meta">{detail}</span></div>
    <span className="transaction-amount">{liability && balance > 0 ? '−' : ''}{formatMoney(balance, balance % 100 !== 0)}</span>
  </div>
}

let plaidScript = null
function loadPlaid() {
  if (window.Plaid) return Promise.resolve(window.Plaid)
  plaidScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    script.onload = () => resolve(window.Plaid)
    script.onerror = () => { plaidScript = null; reject(new Error('Could not load Plaid Link. Check your connection.')) }
    document.head.append(script)
  })
  return plaidScript
}

function AccountsScreen({ onBack, onChanged }) {
  const [status, setStatus] = useState(null)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const refresh = useCallback(async () => {
    const next = await fetchJson('/api/plaid/status')
    setStatus(next)
    if (next.configured) setItems(await fetchJson('/api/plaid/items'))
  }, [])

  useEffect(() => { refresh().catch((reason) => setError(reason.message)) }, [refresh])

  const run = async (label, task) => {
    setBusy(label)
    setError('')
    setMessage('')
    try { await task() } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  const sync = () => run('sync', async () => {
    const result = await sendJson('/api/plaid/sync', 'POST')
    await refresh()
    onChanged()
    if (result.errors.length) throw new Error(`${result.errors[0].institution_name || 'A bank'}: ${result.errors[0].error}`)
    setMessage(`Imported ${result.added} new and updated ${result.modified} transactions.`)
  })

  const link = () => run('link', async () => {
    const [{ link_token }, Plaid] = await Promise.all([sendJson('/api/plaid/link-token', 'POST'), loadPlaid()])
    await new Promise((resolve, reject) => {
      const handler = Plaid.create({
        token: link_token,
        onSuccess: (publicToken, metadata) => {
          sendJson('/api/plaid/exchange', 'POST', { public_token: publicToken, institution_name: metadata?.institution?.name || '' })
            .then(() => sendJson('/api/plaid/sync', 'POST'))
            .then(resolve, reject)
        },
        onExit: (exitError) => (exitError ? reject(new Error(exitError.display_message || exitError.error_message || 'Linking was interrupted.')) : resolve()),
      })
      handler.open()
    })
    await refresh()
    onChanged()
    setMessage('Bank linked. Your transactions are being imported.')
  })

  const remove = (item) => run('remove', async () => {
    await sendJson(`/api/plaid/items/${item.id}`, 'DELETE')
    setConfirmId(null)
    await refresh()
    onChanged()
    setMessage(`${item.institution_name || 'Bank'} was disconnected and its imported transactions were removed. Entries you added yourself were kept.`)
  })

  const cash = items.flatMap((item) => item.accounts).filter((a) => a.type === 'depository').reduce((sum, a) => sum + (a.current_cents ?? 0), 0)

  return <main id="main-content" className="accounts-screen" tabIndex="-1">
    <header className="modal-header"><button type="button" className="cancel-button" onClick={onBack}>Done</button><h1>Accounts</h1><span aria-hidden="true" /></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
    {message && <p className="status-note" role="status">{message}</p>}
    {!status ? <div className="loading-lines" aria-label="Loading accounts"><span/><span/></div> : !status.configured ? <section className="card section-card">
      <EmptyState title="Plaid isn’t set up" message="Add PLAID_CLIENT_ID, PLAID_SECRET and TOKEN_ENCRYPTION_KEY to server/.env, then restart the API. See the README for steps." />
    </section> : <>
      {items.length > 0 && <section className="hero accounts-hero" aria-labelledby="cash-title">
        <p id="cash-title" className="eyebrow">Cash in checking and savings</p>
        <p className="big-stat">{formatMoney(cash, cash % 100 !== 0)}</p>
      </section>}
      {items.map((item) => <section className="card section-card" key={item.id} aria-label={item.institution_name || 'Bank'}>
        <div className="card-heading"><h2>{item.institution_name || 'Bank'}</h2>
          {confirmId === item.id
            ? <button className="text-button danger-text" type="button" disabled={Boolean(busy)} onClick={() => remove(item)}>Confirm remove</button>
            : <button className="text-button danger-text" type="button" disabled={Boolean(busy)} onClick={() => setConfirmId(item.id)} aria-label={`Remove ${item.institution_name || 'bank'}`}>Remove</button>}
        </div>
        {confirmId === item.id && <p className="synced-at" role="status">Removing a bank also removes the transactions imported from it. Entries you added yourself stay.</p>}
        <div className="account-list">{item.accounts.map((account) => <AccountRow key={account.account_id} account={account} />)}</div>
        {item.last_synced_at && <p className="synced-at">Updated {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.last_synced_at))}</p>}
      </section>)}
      {!items.length && <section className="card section-card"><EmptyState title="No banks linked" message="Link a bank to import transactions and see balances automatically." /></section>}
      <div className="accounts-actions">
        <button type="button" className="primary-button" onClick={link} disabled={Boolean(busy)}>{busy === 'link' ? 'Opening…' : 'Link a bank'}</button>
        {items.length > 0 && <button type="button" className="secondary-button" onClick={sync} disabled={Boolean(busy)}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>}
      </div>
      <p className="synced-at">Environment: {status.environment}. Bank tokens are encrypted and stay on this computer.</p>
    </>}
  </main>
}

function TabBar({ active, onNavigate, onAdd }) {
  const tabs = [{ id: 'today', label: 'Today', icon: 'today' }, { id: 'budgets', label: 'Budgets', icon: 'budgets' }, { id: 'add', label: 'Add', icon: 'plus' }, { id: 'insights', label: 'Insights', icon: 'insights' }]
  return <nav className="tabbar" aria-label="Main navigation">
    {tabs.map((tab) => tab.id === 'add' ? <button type="button" className="tab add-tab" key={tab.id} onClick={onAdd} aria-label="Add entry"><span className="add-circle"><Icon name="plus" size={27}/></span><span>Add</span></button> : <button type="button" key={tab.id} className={`tab ${active === tab.id ? 'active' : ''}`} aria-current={active === tab.id ? 'page' : undefined} onClick={() => onNavigate(tab.id)}><Icon name={tab.icon}/><span>{tab.label}</span></button>)}
  </nav>
}

async function fetchJson(path) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json()
}

async function sendJson(path, method, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`)
  return payload
}

function App() {
  const [screen, setScreen] = useState('today')
  const [previousScreen, setPreviousScreen] = useState('today')
  const [editorCategory, setEditorCategory] = useState(null)
  const [data, setData] = useState({ summary: null, budgets: [], transactions: [], month: currentMonth(), items: [] })
  const autoSynced = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const month = currentMonth()
    setLoading(true)
    setError('')
    try {
      const [summary, budgets, transactions, items] = await Promise.all([
        fetchJson(`/api/summary?month=${month}`),
        fetchJson(`/api/budgets?month=${month}`),
        fetchJson(`/api/transactions?month=${month}`),
        fetchJson('/api/plaid/items').catch(() => []),
      ])
      setData({ summary, budgets, transactions, month, items })
    } catch (reason) {
      setError(`${reason.message}. Check that the API is running on port 3001.`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Pull new bank transactions once per page load when a bank is linked.
  useEffect(() => {
    if (loading || autoSynced.current) return
    autoSynced.current = true
    if (data.items.length) sendJson('/api/plaid/sync', 'POST').then(load).catch(() => {})
  }, [loading, data.items.length, load])

  const navigate = (next) => {
    setScreen(next)
    requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
  }
  const openAdd = () => { setPreviousScreen(screen); navigate('add') }
  const closeAdd = () => navigate(previousScreen)
  const saved = async () => { await load(); navigate('today') }
  const openBudgetEditor = (budget) => { setPreviousScreen(screen); setEditorCategory(budget?.category ?? null); navigate('budget-edit') }
  const budgetSaved = async () => { await load(); navigate('budgets') }

  const openAccounts = () => { setPreviousScreen(screen); navigate('accounts') }

  const isModal = screen === 'add' || screen === 'budget-edit' || screen === 'accounts'

  const content = useMemo(() => {
    if (screen === 'add') return <AddScreen onCancel={closeAdd} onSaved={saved} />
    if (screen === 'accounts') return <AccountsScreen onBack={closeAdd} onChanged={load} />
    if (screen === 'budget-edit') return <BudgetEditor budgets={data.budgets} month={data.month} initialCategory={editorCategory} onCancel={closeAdd} onSaved={budgetSaved} />
    if (screen === 'budgets') return <BudgetsScreen data={data} loading={loading} error={error} retry={load} onEditBudget={openBudgetEditor} />
    if (screen === 'insights') return <InsightsScreen data={data} loading={loading} error={error} retry={load} />
    return <TodayScreen data={data} loading={loading} error={error} retry={load} onNavigate={navigate} onAdd={openAdd} onEditBudget={openBudgetEditor} onOpenAccounts={openAccounts} />
  }, [screen, data, loading, error, load, previousScreen, editorCategory])

  return <div className={`app-shell ${isModal ? 'modal-open' : ''}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    {content}
    {!isModal && <TabBar active={screen} onNavigate={navigate} onAdd={openAdd} />}
  </div>
}

export default App
