document.addEventListener("DOMContentLoaded", function () {

    const carBrand = document.getElementById("carBrand");
    const carModel = document.getElementById("carModel");

    // Make sure both dropdowns exist
    if (!carBrand || !carModel) {
        console.error("carBrand or carModel dropdown not found.");
        return;
    }

    // ============================================
    // BRAND → MODEL DATA
    // ============================================

    const carModels = {

        Mahindra: [
            "Thar",
            "Scorpio",
            "Scorpio N",
            "XUV700",
            "XUV 3XO",
            "Bolero",
            "Bolero Neo",
            "Marazzo"
        ],

        Hyundai: [
            "Grand i10 Nios",
            "i20",
            "i20 N Line",
            "Venue",
            "Creta",
            "Alcazar",
            "Verna",
            "Tucson",
            "Exter",
            "Aura"
        ],

        BMW: [
            "2 Series",
            "3 Series",
            "5 Series",
            "7 Series",
            "X1",
            "X3",
            "X5",
            "X7",
            "M2",
            "M3",
            "M4",
            "M5",
            "i4",
            "i5",
            "i7",
            "iX"
        ],

        "Mercedes-Benz": [
            "A-Class",
            "C-Class",
            "E-Class",
            "S-Class",
            "GLA",
            "GLB",
            "GLC",
            "GLE",
            "GLS",
            "AMG GT",
            "EQE",
            "EQS"
        ],

        Audi: [
            "A4",
            "A6",
            "A8",
            "Q3",
            "Q5",
            "Q7",
            "Q8",
            "S5",
            "RS5",
            "RS7",
            "e-tron",
            "Q8 e-tron"
        ],

        Jeep: [
            "Compass",
            "Meridian",
            "Wrangler",
            "Grand Cherokee"
        ],

        Volvo: [
            "S90",
            "XC40",
            "XC60",
            "XC90",
            "C40",
            "EX30",
            "EX40",
            "EX90"
        ],

        Jaguar: [
            "XE",
            "XF",
            "F-Pace",
            "F-Type",
            "I-Pace"
        ],

        "Maruti Suzuki": [
            "Swift",
            "Baleno",
            "Dzire",
            "Brezza",
            "Ertiga",
            "XL6",
            "Grand Vitara",
            "Fronx",
            "Jimny",
            "Ciaz",
            "Invicto"
        ],

        Tata: [
            "Tiago",
            "Tigor",
            "Altroz",
            "Punch",
            "Nexon",
            "Harrier",
            "Safari",
            "Curvv",
            "Nexon EV",
            "Punch EV",
            "Tiago EV"
        ],

        Toyota: [
            "Glanza",
            "Urban Cruiser Hyryder",
            "Innova Crysta",
            "Innova Hycross",
            "Fortuner",
            "Camry",
            "Vellfire",
            "Land Cruiser",
            "Hilux"
        ],

        Kia: [
            "Sonet",
            "Seltos",
            "Carens",
            "Carnival",
            "EV6",
            "EV9"
        ],

        Honda: [
            "Amaze",
            "City",
            "Elevate"
        ],

        MG: [
            "Astor",
            "Hector",
            "Hector Plus",
            "Gloster",
            "ZS EV",
            "Comet EV",
            "Windsor EV"
        ],

        Renault: [
            "Kwid",
            "Triber",
            "Kiger",
            "Duster"
        ],

        Skoda: [
            "Slavia",
            "Kushaq",
            "Kodiaq",
            "Superb",
            "Kylaq"
        ],

        Volkswagen: [
            "Polo",
            "Virtus",
            "Taigun",
            "Tiguan"
        ],

        Ford: [
            "EcoSport",
            "Endeavour",
            "Figo",
            "Aspire",
            "Freestyle"
        ],

        Nissan: [
            "Magnite",
            "X-Trail",
            "Kicks"
        ],

        Lexus: [
            "ES",
            "NX",
            "RX",
            "LX",
            "LM",
            "LC"
        ],

        Mini: [
            "Cooper",
            "Countryman",
            "Clubman",
            "Convertible"
        ],

        Porsche: [
            "718 Cayman",
            "718 Boxster",
            "911",
            "Macan",
            "Cayenne",
            "Panamera",
            "Taycan"
        ],

        "Land Rover": [
            "Defender",
            "Discovery",
            "Discovery Sport",
            "Range Rover",
            "Range Rover Sport",
            "Range Rover Velar",
            "Range Rover Evoque"
        ],

        Fiat: [
            "Punto",
            "Linea",
            "Avventura"
        ],

        Isuzu: [
            "D-Max",
            "MU-X",
            "V-Cross"
        ],

        Maserati: [
            "Ghibli",
            "Quattroporte",
            "Levante",
            "Grecale",
            "MC20"
        ],

        Bentley: [
            "Continental GT",
            "Flying Spur",
            "Bentayga"
        ],

        "Rolls-Royce": [
            "Ghost",
            "Phantom",
            "Cullinan",
            "Spectre"
        ],

        "Aston Martin": [
            "Vantage",
            "DB12",
            "DBX",
            "Vanquish"
        ],

        Bugatti: [
            "Chiron",
            "Mistral",
            "Tourbillon"
        ],

        Ferrari: [
            "Roma",
            "296 GTB",
            "296 GTS",
            "SF90",
            "812 Superfast",
            "Purosangue"
        ],

        Lamborghini: [
            "Huracan",
            "Revuelto",
            "Urus",
            "Temerario"
        ],

        McLaren: [
            "750S",
            "Artura",
            "GTS",
            "765LT",
            "720S"
        ]
    };


    // ============================================
    // INITIAL MODEL STATE
    // ============================================

    carModel.innerHTML = '<option value="">Select Model</option>';
    carModel.disabled = true;


    // ============================================
    // BRAND CHANGE
    // ============================================

    carBrand.addEventListener("change", function () {

        const selectedBrand = carBrand.value;

        // Reset model dropdown
        carModel.innerHTML = '<option value="">Select Model</option>';

        // Disable when no brand is selected
        if (!selectedBrand) {
            carModel.disabled = true;
            return;
        }

        // Get models
        const models = carModels[selectedBrand];

        // No models found
        if (!models) {
            console.warn("No models found for:", selectedBrand);
            carModel.disabled = true;
            return;
        }

        // Add models
        models.forEach(function (model) {

            const option = document.createElement("option");

            option.value = model;
            option.textContent = model;

            carModel.appendChild(option);

        });

        // Enable model dropdown
        carModel.disabled = false;

    });

});