import React from 'react';

const NavigationBar = () => {
  const buttons = [1, 2, 3, 4, 5].map(num => ({
    id: num,
    label: num.toString()
  }));

  const topButtons = buttons.slice(0, 3);
  const bottomButtons = buttons.slice(3);

  const buttonStyle = {
    position: 'relative',
    width: '50px',
    height: '50px',
  };

  const buttonBackgroundStyle = {
    position: 'absolute',
    width: '60px',
    height: '60px',
    left: '-5px',
    top: '-5px',
    background: '#E0E4E9',
    borderRadius: '8px'
  };

  const buttonIconStyle = {
    position: 'absolute',
    width: '50px',
    height: '50px',
    left: '0px',
    top: '0px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#000000'
  };

  return (
    <div className="h-full bg-[#F9FAFB] border-r border-[#E2E8F0] flex flex-col">
      {/* Main navigation area */}
      <div className="h-[calc(100vh-160px)] flex flex-col">
        {/* Logo section */}
        <div className="p-[10px]">
          <img 
            src="/src/assets/Stingrays Logo 80x80.png" 
            alt="Stingrays Logo" 
            className="w-20 h-20"
          />
        </div>
        
        {/* Flex container for all buttons */}
        <div className="flex-1 flex flex-col">
          {/* Center container for top buttons */}
          <div className="flex-1 flex flex-col justify-center items-center">
            {topButtons.map((button, index) => (
              <div key={button.id} className="mb-20 flex justify-center">
                <div style={buttonStyle}>
                  <div style={buttonBackgroundStyle}></div>
                  <div style={buttonIconStyle}>
                    {button.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom buttons */}
          <div className="pb-5">
            {bottomButtons.map((button, index) => (
              <div key={button.id} className="mb-20 last:mb-0 flex justify-center">
                <div style={buttonStyle}>
                  <div style={buttonBackgroundStyle}></div>
                  <div style={buttonIconStyle}>
                    {button.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Storage area height match */}
      <div className="h-[160px] bg-[#F9FAFB]" />
    </div>
  );
};

export default NavigationBar;