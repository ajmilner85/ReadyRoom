import React, { useState } from 'react';
import { X, CheckCircle, Users, Calendar, FileText, Layout, Settings, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getUserPermissionsSync } from '../../utils/permissions';

interface OnboardingGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const { userProfile } = useAuth();
  const permissions = getUserPermissionsSync(userProfile);

  const features = [
    {
      id: 'roster',
      icon: <Users size={24} />,
      name: 'Squadron Roster',
      description: 'View and manage squadron member information',
      hasAccess: permissions.canManageRoster
    },
    {
      id: 'events',
      icon: <Calendar size={24} />,
      name: 'Squadron Events',
      description: 'Create and manage squadron events and attendance',
      hasAccess: permissions.canManageEvents
    },
    {
      id: 'mission-prep',
      icon: <FileText size={24} />,
      name: 'Mission Preparation',
      description: 'Access mission briefings and preparation tools',
      hasAccess: permissions.canAccessMissionPrep
    },
    {
      id: 'flights',
      icon: <Layout size={24} />,
      name: 'Flight Management',
      description: 'Organize and manage flight assignments',
      hasAccess: permissions.canManageFlights
    },
    {
      id: 'settings',
      icon: <Settings size={24} />,
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
            <img 
              src="/src/assets/Stingrays Logo 80x80.png" 
              alt="ReadyRoom Logo" 
              className="w-16 h-16 mx-auto mb-4"
            />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              Welcome, {userProfile?.pilot?.callsign || userProfile?.discordUsername || 'Pilot'}!
            </h3>
            <p className="text-gray-600">
              You've successfully logged into ReadyRoom. Let's get you oriented with what you can do.
            </p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-blue-800 mb-2">Your Account Status</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Discord Connected:</span>
                <span className={userProfile?.discordId ? 'text-green-600' : 'text-red-600'}>
                  {userProfile?.discordId ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pilot Record Linked:</span>
                <span className={userProfile?.pilot ? 'text-green-600' : 'text-yellow-600'}>
                  {userProfile?.pilot ? '✓ Yes' : '⚠ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Permission Level:</span>
                <span className="font-medium text-blue-600">
                  {permissions.level.charAt(0).toUpperCase() + permissions.level.slice(1)}
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
          <p className="text-gray-600 mb-6">
            Based on your role as a <strong>{permissions.level}</strong>, here are the features available to you:
          </p>
          
          <div className="space-y-3">
            {features.map((feature) => (
              <div 
                key={feature.id}
                className={`flex items-start p-4 rounded-lg border ${
                  feature.hasAccess 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className={`mr-3 ${
                  feature.hasAccess ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {feature.hasAccess ? feature.icon : <Lock size={24} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`font-medium ${
                      feature.hasAccess ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      {feature.name}
                    </h4>
                    {feature.hasAccess ? (
                      <CheckCircle size={16} className="text-green-500" />
                    ) : (
                      <Lock size={16} className="text-gray-400" />
                    )}
                  </div>
                  <p className={`text-sm ${
                    feature.hasAccess ? 'text-gray-600' : 'text-gray-500'
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
          <h4 className="font-medium text-gray-800 mb-4">Getting Started</h4>
          
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
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="font-medium text-blue-800 mb-2">
                Start Exploring
              </h5>
              <p className="text-sm text-blue-700 mb-2">
                You can now access these areas:
              </p>
              <ul className="text-sm text-blue-700 space-y-1 ml-4">
                {features.filter(f => f.hasAccess).map(feature => (
                  <li key={feature.id}>• {feature.name}</li>
                ))}
              </ul>
            </div>
            
            {permissions.level === 'guest' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h5 className="font-medium text-red-800 mb-2">
                  Limited Access
                </h5>
                <p className="text-sm text-red-700">
                  You currently have guest-level access. Contact your squadron administrator 
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            {steps[currentStep].title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {steps[currentStep].content}
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="flex space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full ${
                  index === currentStep ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Back
              </button>
            )}
            
            {currentStep < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                Get Started
                <CheckCircle size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingGuide;