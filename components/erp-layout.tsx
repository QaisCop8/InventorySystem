"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MenuThemeProvider } from "@/contexts/menu-theme-context";

const ChatWidget = dynamic(() => import("./chat/chat-widget").then((module) => module.ChatWidget), { ssr: false });
const PersonalAssistantWizard = dynamic(() => import("@/components/onboarding/personal-assistant-wizard"), { ssr: false });

interface ERPLayoutProps {
  children: React.ReactNode;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function ERPLayout({ children, activeSection, onSectionChange }: ERPLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [deferredToolsReady, setDeferredToolsReady] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile); // open sidebar by default on desktop
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const activate = () => setDeferredToolsReady(true);
    const idleCallback = (window as any).requestIdleCallback?.(activate, { timeout: 1200 });
    const timeout = idleCallback == null ? window.setTimeout(activate, 500) : null;
    return () => {
      if (idleCallback != null) (window as any).cancelIdleCallback?.(idleCallback);
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, []);

  const handleSidebarToggle = () => setSidebarOpen(!sidebarOpen);
  const handleOverlayClick = () => isMobile && sidebarOpen && setSidebarOpen(false);

  const handleProfileClick = () => onSectionChange("user-profile");
  const handleSettingsClick = () => onSectionChange("user-settings");
  const sidebarOffset = isMobile ? 0 : sidebarOpen ? 384 : 112;

  return (
    <MenuThemeProvider>
      <div className="flex h-screen bg-background" dir="rtl">
        {/* Mobile overlay */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
            onClick={handleOverlayClick}
            onTouchStart={handleOverlayClick}
          />
        )}

        {/* Sidebar */}
        <div
          className={`${
            isMobile
              ? "fixed right-0 top-0 h-full z-50 transform transition-transform duration-300 ease-in-out"
              : "relative"
          } ${sidebarOpen ? (isMobile ? "translate-x-0" : "block") : isMobile ? "translate-x-full" : "hidden"}`}
        >
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={handleSidebarToggle}
            activeSection={activeSection}
            onSectionChange={(section) => {
              onSectionChange(section);
              if (isMobile) setSidebarOpen(false);
            }}
            isMobile={isMobile}
          />
        </div>

        {/* Main content */}
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{
            marginRight: sidebarOffset,
            marginLeft: 0,
          }}
        >
          <Header
            onMenuClick={handleSidebarToggle}
            activeSection={activeSection}
            onProfileClick={handleProfileClick}
            onSettingsClick={handleSettingsClick}
            onSectionChange={onSectionChange}
          />

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden erp-main-content mobile-safe-area">
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 md:p-6 mobile-scroll-container">{children}</div>
          </main>
        </div>

        {deferredToolsReady && <ChatWidget />}
        {deferredToolsReady && <PersonalAssistantWizard />}
      </div>
    </MenuThemeProvider>
  );
}
