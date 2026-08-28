// =========================================================
// KRUIZLY HOST CAR — CUSTOM LUXURY DROPDOWN WIDGET
// Zero Native Windows Selects | 100% Dark Glass UI
// =========================================================

document.addEventListener("DOMContentLoaded", function () {
  const carBrandSelect = document.getElementById("carBrand");
  const carModelSelect = document.getElementById("carModel");
  const carTransmissionSelect = document.getElementById("carTransmission");
  const carFuelSelect = document.getElementById("carFuel");

  if (!carBrandSelect || !carModelSelect) return;

  // ============================================
  // CURATED AUTOMOTIVE DATABASE
  // ============================================
  const brandData = {
    popular: {
      label: "Popular & Everyday",
      brands: {
        Mahindra: ["Thar", "Scorpio N", "Scorpio Classic", "XUV700", "XUV 3XO", "Bolero Neo"],
        Tata: ["Nexon", "Harrier", "Safari", "Punch", "Curvv", "Altroz"],
        Hyundai: ["Creta", "Venue", "Verna", "i20", "Alcazar", "Tucson"],
        "Maruti Suzuki": ["Grand Vitara", "Brezza", "Swift", "Ertiga", "Fronx", "Jimny", "Baleno", "Dzire"],
        Toyota: ["Fortuner", "Innova Hycross", "Innova Crysta", "Urban Cruiser Hyryder", "Hilux", "Camry"],
        Kia: ["Seltos", "Sonet", "Carens", "Carnival", "EV6"],
        Honda: ["City", "Elevate", "Amaze"],
        Volkswagen: ["Virtus", "Taigun", "Tiguan"],
        Skoda: ["Slavia", "Kushaq", "Kodiaq", "Superb"],
        MG: ["Hector", "Astor", "Gloster", "ZS EV", "Windsor EV"]
      }
    },
    luxury: {
      label: "Luxury & Performance",
      brands: {
        BMW: ["3 Series", "5 Series", "2 Series Gran Coupe", "7 Series", "X1", "X3", "X5", "X7", "M340i"],
        "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "A-Class Limousine", "GLA", "GLC", "GLE", "GLS"],
        Audi: ["A4", "A6", "Q3", "Q5", "Q7", "Q8"],
        "Land Rover": ["Defender 110", "Defender 90", "Range Rover Velar", "Range Rover Evoque", "Range Rover Sport", "Discovery"],
        Jeep: ["Compass", "Meridian", "Wrangler Rubicon", "Grand Cherokee"],
        Volvo: ["XC40", "XC60", "XC90", "S90"],
        Porsche: ["Macan", "Cayenne", "718 Cayman", "Panamera"],
        Mini: ["Cooper S", "Countryman"]
      }
    }
  };

  const allModelsMap = {
    ...brandData.popular.brands,
    ...brandData.luxury.brands
  };

  // Populate native selects for form submission compatibility
  function syncNativeBrandSelect() {
    carBrandSelect.innerHTML = '<option value="">Select Brand</option>';
    ['popular', 'luxury'].forEach(groupKey => {
      const group = brandData[groupKey];
      const optGroup = document.createElement('optgroup');
      optGroup.label = group.label;
      Object.keys(group.brands).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        optGroup.appendChild(opt);
      });
      carBrandSelect.appendChild(optGroup);
    });
  }
  syncNativeBrandSelect();

  // ============================================
  // CUSTOM DROPDOWN COMPONENT GENERATOR
  // ============================================
  function createCustomDropdown(selectEl, config = {}) {
    const parent = selectEl.closest('.partner-field') || selectEl.parentElement;
    selectEl.style.display = 'none'; // visually hide native select

    const selectWrap = selectEl.closest('.select-wrapper');
    if (selectWrap) selectWrap.style.display = 'none';

    // Container
    const dropdownWrap = document.createElement('div');
    dropdownWrap.className = 'custom-dd';
    if (config.id) dropdownWrap.id = config.id;

    // Trigger Button
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'custom-dd-trigger';
    triggerBtn.innerHTML = `
      <span class="custom-dd-label">${config.placeholder || 'Select Option'}</span>
      <svg class="custom-dd-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    // Dropdown Menu Box
    const menuBox = document.createElement('div');
    menuBox.className = 'custom-dd-menu';

    dropdownWrap.appendChild(triggerBtn);
    dropdownWrap.appendChild(menuBox);
    parent.appendChild(dropdownWrap);

    let isMenuOpen = false;

    function open() {
      document.querySelectorAll('.custom-dd.is-open').forEach(dd => {
        if (dd !== dropdownWrap) {
          dd.classList.remove('is-open');
          dd.querySelector('.custom-dd-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });

      if (triggerBtn.disabled) return;
      dropdownWrap.classList.add('is-open');
      triggerBtn.setAttribute('aria-expanded', 'true');
      isMenuOpen = true;
    }

    function close() {
      dropdownWrap.classList.remove('is-open');
      triggerBtn.setAttribute('aria-expanded', 'false');
      isMenuOpen = false;
    }

    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isMenuOpen ? close() : open();
    });

    return {
      wrap: dropdownWrap,
      trigger: triggerBtn,
      label: triggerBtn.querySelector('.custom-dd-label'),
      menu: menuBox,
      open,
      close,
      setDisabled(disabled, placeholderText) {
        triggerBtn.disabled = disabled;
        triggerBtn.classList.toggle('is-disabled', disabled);
        if (placeholderText) this.label.textContent = placeholderText;
      },
      setValue(val, text) {
        selectEl.value = val;
        this.label.textContent = text || val || config.placeholder || 'Select Option';
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
  }

  // 1. BRAND CUSTOM DROPDOWN
  const brandDD = createCustomDropdown(carBrandSelect, {
    id: 'brandCustomDD',
    placeholder: 'Select Brand'
  });

  function renderBrandMenu() {
    brandDD.menu.innerHTML = '';

    ['popular', 'luxury'].forEach(groupKey => {
      const group = brandData[groupKey];
      const header = document.createElement('div');
      header.className = 'custom-dd-header';
      header.textContent = group.label;
      brandDD.menu.appendChild(header);

      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'custom-dd-grid';

      Object.keys(group.brands).forEach(brandName => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'custom-dd-item';
        item.innerHTML = `<span>${brandName}</span>`;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          brandDD.setValue(brandName, brandName);
          brandDD.close();
          updateModelDD(brandName);
        });

        itemsGrid.appendChild(item);
      });

      brandDD.menu.appendChild(itemsGrid);
    });
  }
  renderBrandMenu();

  // 2. MODEL CUSTOM DROPDOWN
  const modelDD = createCustomDropdown(carModelSelect, {
    id: 'modelCustomDD',
    placeholder: 'Select Model'
  });
  modelDD.setDisabled(true, 'Select Brand First');

  function updateModelDD(selectedBrand) {
    const models = allModelsMap[selectedBrand] || [];
    carModelSelect.innerHTML = '<option value="">Select Model</option>';
    modelDD.menu.innerHTML = '';

    if (!models.length) {
      modelDD.setDisabled(true, 'Select Brand First');
      return;
    }

    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      carModelSelect.appendChild(opt);
    });

    const header = document.createElement('div');
    header.className = 'custom-dd-header';
    header.textContent = `${selectedBrand} Models`;
    modelDD.menu.appendChild(header);

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'custom-dd-grid';

    models.forEach(modelName => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-dd-item';
      item.innerHTML = `<span>${modelName}</span>`;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        modelDD.setValue(modelName, modelName);
        modelDD.close();
      });

      itemsGrid.appendChild(item);
    });

    modelDD.menu.appendChild(itemsGrid);
    modelDD.setDisabled(false, 'Select Model');
  }

  // 3. TRANSMISSION CUSTOM DROPDOWN
  if (carTransmissionSelect) {
    const transDD = createCustomDropdown(carTransmissionSelect, {
      id: 'transCustomDD',
      placeholder: 'Select Transmission'
    });
    transDD.menu.innerHTML = '';
    const transGrid = document.createElement('div');
    transGrid.className = 'custom-dd-grid';
    ['Manual', 'Automatic', 'AMT', 'IMT'].forEach(t => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-dd-item';
      item.textContent = t;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        transDD.setValue(t, t);
        transDD.close();
      });
      transGrid.appendChild(item);
    });
    transDD.menu.appendChild(transGrid);
    transDD.setValue('Manual', 'Manual');
  }

  // 4. FUEL TYPE CUSTOM DROPDOWN
  if (carFuelSelect) {
    const fuelDD = createCustomDropdown(carFuelSelect, {
      id: 'fuelCustomDD',
      placeholder: 'Select Fuel Type'
    });
    fuelDD.menu.innerHTML = '';
    const fuelGrid = document.createElement('div');
    fuelGrid.className = 'custom-dd-grid';
    ['Petrol', 'Diesel', 'Petrol + CNG', 'Electric'].forEach(f => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-dd-item';
      item.textContent = f;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        fuelDD.setValue(f, f);
        fuelDD.close();
      });
      fuelGrid.appendChild(item);
    });
    fuelDD.menu.appendChild(fuelGrid);
    fuelDD.setValue('Petrol', 'Petrol');
  }

  // Global click outside to close dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dd')) {
      document.querySelectorAll('.custom-dd.is-open').forEach(dd => {
        dd.classList.remove('is-open');
        dd.querySelector('.custom-dd-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
  });
});