async function loadVersion() {
  const res = await fetch('/version');
  const data = await res.json();
  document.getElementById('version-info').textContent =
    'Version ' + data.version + ' (' + data.color + ')';
  document.getElementById('hostname-info').textContent = data.hostname;
  document.getElementById('banner').style.background = data.color;
}

async function loadProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();
  const tbody = document.getElementById('product-rows');
  tbody.innerHTML = '';
  products.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + p.name + '</td>' +
      '<td>' + p.sku + '</td>' +
      '<td>' + p.stock + '</td>' +
      '<td>$' + Number(p.price).toFixed(2) + '</td>' +
      '<td><button data-id="' + p.id + '" class="delete-btn">Eliminar</button></td>';
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await fetch('/api/products/' + id, { method: 'DELETE' });
      loadProducts();
    });
  });
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('name').value,
    sku: document.getElementById('sku').value,
    stock: document.getElementById('stock').value,
    price: document.getElementById('price').value,
  };
  await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  e.target.reset();
  loadProducts();
});

loadVersion();
loadProducts();
