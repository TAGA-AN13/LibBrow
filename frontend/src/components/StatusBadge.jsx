const styles = {
  Pending: 'bg-[#FBF5E6] text-[#26364A] ring-[#E8D8AE]',
  Approved: 'bg-[#E8F0F8] text-[#315B86] ring-[#DCE6F0]',
  Denied: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${styles[status] ?? 'bg-[#E8F0F8] text-[#26364A] ring-stone-200'}`}>
      {status}
    </span>
  );
}
