export default function FooterComponent() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        position: "static",
        width: "100%",
        padding: "16px 24px",
        backgroundColor: "#14558F",
        color: "#ffffff",
        fontFamily: "'Noto Sans', sans-serif",
        fontSize: "14px",
        textAlign: "center",
      }}
    >
      &copy; {year} GrantWell
    </footer>
  );
}
