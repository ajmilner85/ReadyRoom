import React, { useState } from 'react';
import { Icon } from '../ui/primitives';
import { useAuth } from '../../context/AuthContext';
import { useSimplePermissions } from '../../hooks/usePermissions';

interface OnboardingGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const { userProfile } = useAuth();
  const permissions = useSimplePermissions();

  const features = [
    {
      id: 'roster',
      icon: <Icon name="roster" size={24} />,
      name: 'Squadron Roster',
      description: 'View and manage squadron member information',
      hasAccess: permissions.hasPermission('manage_roster')
    },
    {
      id: 'events',
      icon: <Icon name="events" size={24} />,
      name: 'Squadron Events',
      description: 'Create and manage squadron events and attendance',
      hasAccess: permissions.hasPermission('manage_events')
    },
    {
      id: 'mission-prep',
      icon: <Icon name="dossier" size={24} />,
      name: 'Mission Preparation',
      description: 'Access mission briefings and preparation tools',
      hasAccess: permissions.canAccessMissionPrep
    },
    {
      id: 'flights',
      icon: <Icon name="grid" size={24} />,
      name: 'Flight Management',
      description: 'Organize and manage flight assignments',
      hasAccess: permissions.hasPermission('edit_flight_assignments')
    },
    {
      id: 'settings',
      icon: <Icon name="settings" size={24} />,
      name: 'Settings',
      description: 'Configure squadron and organization settings',
      hasAccess: permissions.canAccessSettings
    }
  ];

  const steps = [
    {
      title: 'Welcome to ReadyRoom!',
      content: (
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-panel3 rounded-lg flex items-center justify-content">
              <span className="text-2xl font-bold text-text2 mx-auto">RR</span>
            </div>
            <h3 className="text-xl font-semibold text-text mb-2">
              Welcome, {userProfile?.pilot?.callsign || userProfile?.discordUsername || 'Pilot'}!
            </h3>
            <p className="text-text2">
              You've successfully logged into ReadyRoom. Let's get you oriented with what you can do.
            </p>
          </div>
          
          <div className="bg-accent-weak border border-accent rounded-lg p-4 mb-4">
            <h4 className="font-medium text-blue-800 mb-2">Your Account Status</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Discord Connected:</span>
                <span className={userProfile?.discordId ? 'text-good' : 'text-bad'}>
                  {userProfile?.discordId ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pilot Record Linked:</span>
                <span className={userProfile?.pilot ? 'text-good' : 'text-warn'}>
                  {userProfile?.pilot ? '✓ Yes' : '⚠ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Permission Level:</span>
                <span className="font-medium text-accent">
                  Squadron Member
                </span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Your Available Features',
      content: (
        <div>
          <p className="text-text2 mb-6">
            Based on your permissions, here are the features available to you:
          </p>
          
          <div className="space-y-3">
            {features.map((feature) => (
              <div 
                key={feature.id}
                className={`flex items-start p-4 rounded-lg border ${
                  feature.hasAccess 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-border bg-panel2'
                }`}
              >
                <div className={`mr-3 ${
                  feature.hasAccess ? 'text-good' : 'text-text3'
                }`}>
                  {feature.hasAccess ? feature.icon : <Icon name="lock" size={24} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`font-medium ${
                      feature.hasAccess ? 'text-text' : 'text-text2'
                    }`}>
                      {feature.name}
                    </h4>
                    {feature.hasAccess ? (
                      <Icon name="checkCircle" size={16} className="text-good" />
                    ) : (
                      <Icon name="lock" size={16} className="text-text3" />
                    )}
                  </div>
                  <p className={`text-sm ${
                    feature.hasAccess ? 'text-text2' : 'text-text2'
                  }`}>
                    {feature.description}
                    {!feature.hasAccess && (
                      <span className="block mt-1 text-xs italic">
                        Contact your squadron administrator for access
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: 'Next Steps',
      content: (
        <div>
          <h4 className="font-medium text-text mb-4">Getting Started</h4>
          
          <div className="space-y-4">
            {!userProfile?.pilot && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h5 className="font-medium text-yellow-800 mb-2">
                  Link Your Pilot Record
                </h5>
                <p className="text-sm text-yellow-700 mb-2">
                  Your account isn't linked to a pilot record yet. Contact your squadron administrator to:
                </p>
                <ul className="text-sm text-yellow-700 space-y-1 ml-4">
                  <li>• Link your Discord account to your pilot record</li>
                  <li>• Get proper role assignments</li>
                  <li>• Access additional features</li>
                </ul>
              </div>
            )}
            
            <div className="bg-accent-weak border border-accent rounded-lg p-4">
              <h5 className="font-medium text-blue-800 mb-2">
                Start Exploring
              </h5>
              <p className="text-sm text-accent mb-2">
                You can now access these areas:
              </p>
              <ul className="text-sm text-accent space-y-1 ml-4">
                {features.filter(f => f.hasAccess).map(feature => (
                  <li key={feature.id}>• {feature.name}</li>
                ))}
              </ul>
            </div>
            
            {!permissions.hasPermission('manage_roster') && !permissions.hasPermission('manage_events') && (
              <div className="bg-red-50 border border-bad rounded-lg p-4">
                <h5 className="font-medium text-red-800 mb-2">
                  Limited Access
                </h5>
                <p className="text-sm text-bad">
                  You currently have limited access. Contact your squadron administrator 
                  to get proper role assignments and unlock additional features.
                </p>
              </div>
            )}
          </div>
        </div>
      )
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-panel rounded-lg shadow-rr-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-text">
            {steps[currentStep].title}
          </h2>
          <button
            onClick={onClose}
            className="text-text3 hover:text-text transition-colors"
          >
            <Icon name="close" size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {steps[currentStep].content}
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-panel2">
          <div className="flex space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full ${
                  index === currentStep ? 'bg-accent' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 text-text2 hover:text-gray-800 transition-colors"
              >
                Back
              </button>
            )}
            
            {currentStep < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:brightness-110 transition-colors flex items-center gap-2"
              >
                Next
                <Icon name="arrowRight" size={16} />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-good text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                Get Started
                <Icon name="checkCircle" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingGuide;