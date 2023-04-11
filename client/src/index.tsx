import React from 'react';
import ReactDOM from 'react-dom/client';
import './css/index.css';
import './css/themes.css';
import App from './App';

const root = ReactDOM.createRoot(
	document.getElementById('root') as HTMLElement
);

// if ((module as any).hot && process.env.NODE_ENV !== 'production') {
// 	(module as any).hot.accept();
// }

root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);