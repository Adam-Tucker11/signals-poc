'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Toaster } from 'sonner';
import { 
  BarChart3, 
  GitBranch, 
  TrendingUp, 
  Settings,
  Activity
} from 'lucide-react';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  const navItems = [
    { 
      href: '/sessions', 
      label: 'Sessions', 
      icon: BarChart3,
      description: 'Manage and analyze sessions'
    },
    { 
      href: '/taxonomy', 
      label: 'Taxonomy', 
      icon: GitBranch,
      description: 'Topic hierarchy and relations'
    },
    { 
      href: '/scores', 
      label: 'Analytics', 
      icon: TrendingUp,
      description: 'Performance metrics'
    },
    { 
      href: '/settings', 
      label: 'Settings', 
      icon: Settings,
      description: 'System configuration'
    },
  ];
  
  return (
    <>
      <div className="flex min-h-screen bg-background">
        {/* Linear-style Sidebar */}
        <div className="sidebar">
          {/* Logo Section */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-foreground rounded-md flex items-center justify-center">
                <span className="text-background text-sm font-semibold">S</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Signals</h1>
                <p className="text-xs text-muted-foreground">Intelligence Platform</p>
              </div>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="space-y-1 flex-1">
            {navItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <Icon size={16} />
                  <div className="flex-1">
                    <div className="font-medium">
                      {item.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>
          
          {/* Status Section */}
          <div className="pt-6 border-t border-border">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div>
                <div className="text-xs font-medium text-foreground">System Status</div>
                <div className="text-xs text-muted-foreground">Online</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main content */}
        <div className="flex-1 min-h-screen overflow-auto">
          <div className="container py-8">
            <div className="animate-in">
              {children}
            </div>
          </div>
        </div>
      </div>
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          },
        }}
      />
    </>
  );
}