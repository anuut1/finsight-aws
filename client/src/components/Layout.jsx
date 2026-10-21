import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';

const Layout = ({ children }) => {
  return (
    <div className="app-shell">
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <main style={{ padding: '1.5rem 2rem', flex: 1 }}>{children}</main>
      </div>
    </div>
  );
};

export default Layout;

