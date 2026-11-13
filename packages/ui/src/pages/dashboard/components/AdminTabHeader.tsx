/** The visible heading and one-line purpose at the top of every Admin dashboard tab. */
export default function AdminTabHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="admin-tab-header">
      <h2 className="admin-tab-header__title">{title}</h2>
      <p className="admin-tab-header__intro">{intro}</p>
    </div>
  );
}
