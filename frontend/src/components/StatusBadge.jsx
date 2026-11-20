const styles = {
  Pending: 'bg-[#F4D6B0] text-[#0B132B] ring-[#D97706]',
  Approved: 'bg-[#EAF7FB] text-[#1C2541] ring-[#5BC0DE]',
  Denied: 'bg-rose-100 text-rose-800 ring-rose-200',
  Returned: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Lost: 'bg-rose-100 text-rose-800 ring-rose-200',
  Damaged: 'bg-[#F4D6B0] text-[#0B132B] ring-[#D97706]',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${styles[status] ?? 'bg-[#EAF7FB] text-[#1C2541] ring-[#5BC0DE]'}`}>
      {status}
    </span>
  );
}
