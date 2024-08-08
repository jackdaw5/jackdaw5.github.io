document.getElementById('login-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const usernameEmail = document.getElementById('username-email').value;
  const password = document.getElementById('password').value;
  const credentials = btoa(`${usernameEmail}:${password}`);
  
  try {
      const response = await fetch('https://01.kood.tech/api/auth/signin', {
          method: 'POST',
          headers: {
              'Authorization': `Basic ${credentials}`
          }
      });
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      if (!response.ok) {
          throw new Error('Invalid credentials');
      }
      const data = await response.json();
      console.log('Response data:', data);
      const jwt = data;
      if (!jwt) {
          throw new Error('Token not found in response');
      }
      localStorage.setItem('jwt', jwt);
      
      document.getElementById('error-message').textContent = '';
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('logout-button').style.display = 'block';
      document.getElementById('profile').style.display = '';
      
      const userId = parseJwt(jwt).id;
      await populateProfile(jwt, userId);
      
  } catch (error) {
      console.error('Error:', error);
      document.getElementById('error-message').textContent = error.message;
  }
});

document.getElementById('logout-button').addEventListener('click', function() {
  localStorage.removeItem('jwt');
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('logout-button').style.display = 'none';
  document.getElementById('profile').style.display = 'none';
});

async function populateProfile(jwt, userId) {
  try {
      const userData = await fetchUserData(jwt, userId);
   
      document.getElementById('user-login').textContent = `Login: ${userData.login}`;
      let totalXP = userData.transactions.reduce((total, transaction) => {
          if (transaction.type === 'xp') {
              return total + transaction.amount;
          } else {
              return total;
          }
      }, 0);
      document.getElementById('user-xp').textContent = `XP: ${totalXP}`;

      let xpByProject = userData.transactions
          .filter(t => t.type === 'xp')
          .map(t => ({ name: t.object.name, amount: t.amount }));
      
      renderPieChart(xpByProject);

      let passFailCounts = userData.transactions.reduce((acc, transaction) => {
          if (transaction.type === 'xp') {
              if (transaction.object.status === 'PASS') {
                  acc.pass += 1;
              } else if (transaction.object.status === 'FAIL') {
                  acc.fail += 1;
              }
          }
          return acc;
      }, { pass: 0, fail: 0 });

      let passFailData = [
          { name: 'PASS', amount: passFailCounts.pass },
          { name: 'FAIL', amount: passFailCounts.fail }
      ];

      renderPassFailChart(userData.auditRatio);

      document.getElementById('profile').style.display = 'block';
  } catch (error) {
      console.error('Error in populateProfile:', error);
      throw new Error('Failed to populate profile');
  }
}

async function fetchUserData(jwt, userId) {
  const query = `
      query {
          user {
              id
              login
              attrs
              auditRatio
              totalDown
              totalUp
              transactions(where: {event: {id: {_eq: 85}}}) {
                  type
                  amount
                  object {
                      name
                  }
              }
          }
      }`;
  const response = await fetch('https://01.kood.tech/api/graphql-engine/v1/graphql', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
  });
  const result = await response.json();
  console.log('User data:', result);
  if (!result.data) {
      console.error('GraphQL query error:', result);
      throw new Error('Failed to fetch user data');
  }
  return result.data.user[0];
}

function renderPieChart(xpByProject) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = 300; // Increase width for more space
  const height = 300; // Increase height for more space
  const radius = Math.min(width, height) / 2;
  const colors = ['#58dbd9', '#45afbf', '#3380a6', '#2a5796', '#1f3c80', '#0b1857'];

  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.overflow = "visible"; // Ensure SVG overflows are visible

  const totalXP = xpByProject.reduce((acc, curr) => acc + curr.amount, 0);
  let startAngle = -Math.PI / 2; // Start angle at -90 degrees (top of the circle)

  const labels = [];

  xpByProject.forEach((d, i) => {
      const sliceAngle = (d.amount / totalXP) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      const midAngle = startAngle + sliceAngle / 2;

      const labelRadius = radius * 1.8; // Place text slightly further outside the radius
      const labelX = radius + labelRadius * Math.cos(midAngle);
      const labelY = radius + labelRadius * Math.sin(midAngle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("dy", "0.35em");
      text.setAttribute("text-anchor", midAngle > Math.PI ? "end" : "start");
      text.setAttribute("fill", "#333");
      
      text.textContent = d.name;

      labels.push(text);
      svg.appendChild(text);

      startAngle = endAngle;
  });

  // Adjust label positions to prevent overlap
  resolveLabelOverlaps(labels);

  startAngle = -Math.PI / 2;

  xpByProject.forEach((d, i) => {
      const sliceAngle = (d.amount / totalXP) * 2 * Math.PI;

      const x1 = radius + radius * Math.cos(startAngle);
      const y1 = radius + radius * Math.sin(startAngle);
      const x2 = radius + radius * Math.cos(startAngle + sliceAngle);
      const y2 = radius + radius * Math.sin(startAngle + sliceAngle);

      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

      const pathData = [
          `M ${radius},${radius}`,
          `L ${x1},${y1}`,
          `A ${radius},${radius} 0 ${largeArcFlag} 1 ${x2},${y2}`,
          `Z`
      ].join(' ');

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("fill", colors[i % colors.length]);
      path.setAttribute("data-name", d.name); // Set task name as a data attribute
      svg.appendChild(path);

      startAngle += sliceAngle;
  });

  const chartContainer = document.getElementById('graph3');
  chartContainer.innerHTML = ''; // Clear previous SVG content if any
  chartContainer.appendChild(svg);
}

function resolveLabelOverlaps(labels) {
  const spacing = 20; // Minimum space between labels

  // Sort labels by their y position
  labels.sort((a, b) => parseFloat(a.getAttribute("y")) - parseFloat(b.getAttribute("y")));

  let overlapResolved = false;

  while (!overlapResolved) {
      overlapResolved = true;

      for (let i = 1; i < labels.length; i++) {
          const curr = labels[i];
          const prev = labels[i - 1];

          const currY = parseFloat(curr.getAttribute("y"));
          const prevY = parseFloat(prev.getAttribute("y")) + prev.getBBox().height + spacing;

          if (currY < prevY) {
              curr.setAttribute("y", prevY);
              overlapResolved = false;
          }
      }
  }

  // Adjust x position to ensure labels stay inside the chart area
  labels.forEach(label => {
      const bbox = label.getBBox();
      if (bbox.x < 0) {
          label.setAttribute("x", parseFloat(label.getAttribute("x")) + Math.abs(bbox.x));
      } else if (bbox.x + bbox.width > 450) {
          label.setAttribute("x", parseFloat(label.getAttribute("x")) - (bbox.x + bbox.width - 450));
      }
  });
}

function renderPassFailChart(auditRatio) {
  if (typeof auditRatio !== 'number' || auditRatio < 0) {
      console.error('Invalid auditRatio:', auditRatio);
      document.getElementById('graph4').innerHTML = '<p>No valid audit ratio data available.</p>';
      return;
  }

  const totalParts = auditRatio + 1;
  const passAmount = (auditRatio / totalParts) * 100;
  const failAmount = 100 - passAmount;

  const passFailData = [
      { name: 'DONE', amount: passAmount },
      { name: 'RECIVED', amount: failAmount }
  ];

  const total = 100; // Total percentage is always 100

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = 300;
  const height = 300;
  const radius = Math.min(width, height) / 2;
  const colors = ['#0b1857', '#58dbd9'];

  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  let startAngle = -Math.PI / 2;
  const labels = [];

  passFailData.forEach((d, i) => {
      const sliceAngle = (d.amount / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const midAngle = startAngle + sliceAngle / 2;

      const labelRadius = radius * 1.8;
      const labelX = radius + labelRadius * Math.cos(midAngle);
      const labelY = radius + labelRadius * Math.sin(midAngle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("dy", "0.35em");
      text.setAttribute("text-anchor", midAngle > Math.PI ? "end" : "start");
      text.setAttribute("fill", "#333");
      
      text.textContent = `${d.name} (${d.amount.toFixed(1)}%)`;

      labels.push(text);
      svg.appendChild(text);

      startAngle = endAngle;
  });

  // Adjust label positions to prevent overlap
  resolveLabelOverlaps2(labels, width);

  startAngle = -Math.PI / 2;

  passFailData.forEach((d, i) => {
      const sliceAngle = (d.amount / total) * 2 * Math.PI;

      const x1 = radius + radius * Math.cos(startAngle);
      const y1 = radius + radius * Math.sin(startAngle);
      const x2 = radius + radius * Math.cos(startAngle + sliceAngle);
      const y2 = radius + radius * Math.sin(startAngle + sliceAngle);

      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

      const pathData = [
          `M ${radius},${radius}`,
          `L ${x1},${y1}`,
          `A ${radius},${radius} 0 ${largeArcFlag} 1 ${x2},${y2}`,
          `Z`
      ].join(' ');

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("fill", colors[i % colors.length]);
      svg.appendChild(path);

      startAngle += sliceAngle;
  });

  const chartContainer = document.getElementById('graph4');
  chartContainer.innerHTML = ''; // Clear previous SVG content if any
  chartContainer.appendChild(svg);
}

function resolveLabelOverlaps2(labels, chartWidth) {
  const spacing = 15; // Minimum space between labels

  // Sort labels by their y position
  labels.sort((a, b) => parseFloat(a.getAttribute("y")) - parseFloat(b.getAttribute("y")));

  let overlapResolved = false;

  while (!overlapResolved) {
      overlapResolved = true;

      for (let i = 1; i < labels.length; i++) {
          const curr = labels[i];
          const prev = labels[i - 1];

          const currY = parseFloat(curr.getAttribute("y"));
          const prevY = parseFloat(prev.getAttribute("y")) + prev.getBBox().height + spacing;

          if (currY < prevY) {
              curr.setAttribute("y", prevY);
              overlapResolved = false;
          }
      }
  }

  // Adjust x position to ensure labels stay inside the chart area
  labels.forEach(label => {
      const bbox = label.getBBox();
      if (bbox.x < 0) {
          label.setAttribute("x", parseFloat(label.getAttribute("x")) + Math.abs(bbox.x));
      } else if (bbox.x + bbox.width > chartWidth) {
          label.setAttribute("x", parseFloat(label.getAttribute("x")) - (bbox.x + bbox.width - chartWidth));
      }
  });
}


function parseJwt(token) {
  if (!token) {
      throw new Error('Invalid token');
  }
  const base64Url = token.split('.')[1];
  if (!base64Url) {
      throw new Error('Token payload not found');
  }
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}
