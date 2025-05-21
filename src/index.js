class EVCRegistration {
    constructor(config = {}) {
        this.config = {
            containerId: config.containerId || 'evc-registration-container',
            apiUrl: config.apiUrl || 'https://evc-proxy-skillspot.azurewebsites.net',
            embedToken: config.embedToken,
            debug: config.debug || false,
            onSuccess: config.onSuccess || this.defaultSuccess,
            onError: config.onError || this.defaultError,
            onValidationError: config.onValidationError || this.defaultValidationError
        };

        if (!this.config.embedToken) {
            throw new Error('embedToken is verplicht');
        }

        // Injecteer CSS
        this.injectStyles();

        // Start initialisatie
        this.initialize();
    }

    injectStyles() {
        const styles = `
            .evc-form {
                max-width: 800px;
                margin: 20px auto;
                padding: 20px;
                font-family: Arial, sans-serif;
            }
            .evc-form-group {
                margin-bottom: 15px;
            }
            .evc-form label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            .evc-form input,
            .evc-form select,
            .evc-form textarea {
                width: 100%;
                padding: 8px;
                margin-bottom: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            .evc-form button {
                background: #007bff;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            .evc-form button:hover {
                background: #0056b3;
            }
            .evc-error {
                color: #721c24;
                background-color: #f8d7da;
                padding: 15px;
                margin-bottom: 20px;
                border-radius: 4px;
            }
            .evc-success {
                color: #155724;
                background-color: #d4edda;
                padding: 15px;
                margin-bottom: 20px;
                border-radius: 4px;
            }
            .evc-file-upload {
                border: 1px dashed #ddd;
                padding: 15px;
                border-radius: 4px;
                background-color: #f9f9f9;
                margin-bottom: 10px;
            }
            .evc-file-upload input[type="file"] {
                width: 100%;
                padding: 8px 0;
            }
            .evc-file-upload-label {
                display: block;
                margin-bottom: 8px;
                font-weight: bold;
            }
            .evc-file-list {
                margin-top: 10px;
            }
            .evc-file-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px 10px;
                background-color: #e9ecef;
                border-radius: 4px;
                margin-bottom: 5px;
            }
            .evc-file-item button {
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 12px;
                cursor: pointer;
            }
            .evc-upload-progress {
                width: 100%;
                height: 5px;
                background-color: #e9ecef;
                margin-top: 5px;
                border-radius: 4px;
                overflow: hidden;
            }
            .evc-upload-progress-bar {
                height: 100%;
                background-color: #007bff;
                width: 0%;
                transition: width 0.3s ease;
            }
        `;

        const styleSheet = document.createElement("style");
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    async initialize() {
        try {
            // Valideer container
            this.container = document.getElementById(this.config.containerId);
            if (!this.container) {
                throw new Error(`Container met ID "${this.config.containerId}" niet gevonden`);
            }

            // Eerst provider initialiseren
            await this.initializeProvider();

            // Dan domein valideren
            const currentDomain = window.location.hostname;
            try {
                await this.validateHostDomain(currentDomain);
            } catch (error) {
                // Toon duidelijke foutmelding voor domein validatie
                this.container.innerHTML = `
                    <div class="evc-error">
                        <strong>Fout bij laden formulier:</strong>
                        <p>${error.message}</p>
                        <p>Dit formulier mag niet vanaf dit domein (${currentDomain}) worden geladen. 
                        Neem contact op met de EVC-aanbieder.</p>
                    </div>`;
                throw error;
            }

            // Nu trajecten ophalen
            await this.loadTrajectories();

            // Als alles goed is, render het formulier
            this.renderForm();
            this.setupEventListeners();
            this.fillContainerSelect(); // Expliciet containers vullen
            this.setupTrajectorySelects(); // Setup trajectory selectie

        } catch (error) {
            console.error('Initialisatie fout:', error);
            this.config.onError(error);
            // Niet doorgaan met renderen als er een fout is
            return;
        }
    }

    async initializeProvider() {
        try {
            if (this.config.debug) {
                console.log('Initialiseren provider met token:', this.config.embedToken);
            }

            const response = await fetch(`${this.config.apiUrl}/api/providers/validate-token`, {
                headers: {
                    'Authorization': `Bearer ${this.config.embedToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Ongeldige embed token');
            }

            const data = await response.json();
            this.providerId = data.id;
            this.providerName = data.name;

            if (this.config.debug) {
                console.log('Provider geïnitialiseerd:', {
                    id: this.providerId,
                    name: this.providerName
                });
            }

        } catch (error) {
            console.error('Provider initialisatie fout:', error);
            throw error;
        }
    }

    async loadTrajectories() {
        try {
            if (this.config.debug) {
                console.log('Trajecten ophalen voor provider:', this.providerId);
            }

            const response = await fetch(
                `${this.config.apiUrl}/api/providers/${this.providerId}/trajectories/public`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.embedToken}`,
                        'Accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error('Kon trajecten niet ophalen');
            }

            const data = await response.json();
            if (!data || !Array.isArray(data)) {
                console.error('Onverwachte data structuur:', data);
                throw new Error('Ongeldige trajecten data ontvangen');
            }

            this.containers = data;
            console.log('Geladen trajecten:', this.containers); // Debug logging

            this.config.onLoad?.(data);
            return data;

        } catch (error) {
            console.error('Error bij ophalen trajecten:', error);
            throw error;
        }
    }

    fillContainerSelect() {
        const containerSelect = this.container.querySelector('#container_id');
        if (!containerSelect) return;

        // Reset en vul container select
        containerSelect.innerHTML = '<option value="">Selecteer een richting</option>';
        
        if (this.containers && this.containers.length > 0) {
            this.containers.forEach(container => {
                const option = document.createElement('option');
                option.value = container.id;
                option.textContent = container.name;
                containerSelect.appendChild(option);
            });
        } else {
            this.showError('Geen trajecten beschikbaar');
        }
    }

    renderForm() {
        this.container.innerHTML = `
            <form id="evc-registration-form" class="evc-form">
                <!-- Persoonlijke gegevens -->
                <h3>Persoonlijke gegevens</h3>
                <div class="evc-form-group">
                    <label for="title">Aanhef *</label>
                    <select name="title" id="title" required>
                        <option value="Dhr">De heer</option>
                        <option value="Mevr">Mevrouw</option>
                    </select>
                </div>

                <div class="evc-form-group">
                    <label for="first_name">Voornaam *</label>
                    <input type="text" id="first_name" name="first_name" required>
                </div>

                <div class="evc-form-group">
                    <label for="middle_name">Tussenvoegsel</label>
                    <input type="text" id="middle_name" name="middle_name">
                </div>

                <div class="evc-form-group">
                    <label for="last_name">Achternaam *</label>
                    <input type="text" id="last_name" name="last_name" required>
                </div>

                <!-- Contactgegevens -->
                <h3>Contactgegevens</h3>
                <div class="evc-form-group">
                    <label for="email">E-mail *</label>
                    <input type="email" id="email" name="email" required>
                </div>

                <div class="evc-form-group">
                    <label for="street_address">Straat + huisnummer *</label>
                    <input type="text" id="street_address" name="street_address" required>
                </div>

                <div class="evc-form-group">
                    <label for="postal_code">Postcode *</label>
                    <input type="text" id="postal_code" name="postal_code" required>
                </div>

                <div class="evc-form-group">
                    <label for="city">Plaats *</label>
                    <input type="text" id="city" name="city" required>
                </div>

                <div class="evc-form-group">
                    <label for="phone_number">Telefoonnummer *</label>
                    <input type="tel" id="phone_number" name="phone_number" required>
                </div>

                <div class="evc-form-group">
                    <label for="mobile_number">Mobiel nummer</label>
                    <input type="tel" id="mobile_number" name="mobile_number">
                </div>

                <!-- Persoonlijke informatie -->
                <h3>Persoonlijke informatie</h3>
                <div class="evc-form-group">
                    <label for="date_of_birth">Geboortedatum *</label>
                    <input type="date" id="date_of_birth" name="date_of_birth" required>
                </div>

                <div class="evc-form-group">
                    <label for="place_of_birth">Geboorteplaats *</label>
                    <input type="text" id="place_of_birth" name="place_of_birth" required>
                </div>

                <div class="evc-form-group">
                    <label for="social_security_number">BSN *</label>
                    <input type="text" id="social_security_number" name="social_security_number" required>
                </div>

                <!-- EVC Traject -->
                <h3>EVC Traject</h3>
                <div class="evc-form-group">
                    <label for="container_id">EVC Richting *</label>
                    <select name="container_id" id="container_id" required>
                        <option value="">Selecteer een richting</option>
                    </select>
                </div>

                <div class="evc-form-group" id="trajectory_group" style="display: none;">
                    <label for="trajectory_id">EVC Traject *</label>
                    <select name="trajectory_id" id="trajectory_id">
                        <option value="">Selecteer eerst een richting</option>
                    </select>
                </div>

                <!-- Werkervaring -->
                <h3>Opleiding & Werkervaring</h3>
                <div class="evc-form-group">
                    <label for="relevant_diplomas">Relevante diploma's *</label>
                    <input type="text" id="relevant_diplomas" name="relevant_diplomas" required>
                </div>

                <div class="evc-form-group">
                    <label for="has_experience">Werkervaring? *</label>
                    <select name="has_experience" id="has_experience" required>
                        <option value="true">Ja</option>
                        <option value="false">Nee</option>
                    </select>
                </div>

                <div class="evc-form-group">
                    <label for="years_of_experience">Jaren ervaring</label>
                    <input type="number" id="years_of_experience" name="years_of_experience">
                </div>

                <div class="evc-form-group">
                    <label for="additional_notes">Extra opmerkingen</label>
                    <textarea id="additional_notes" name="additional_notes"></textarea>
                </div>

                <!-- Werkgever -->
                <h3>Werkgever gegevens (optioneel)</h3>
                <div class="evc-form-group">
                    <label for="employer_kvk">KVK-nummer</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="employer_kvk" name="employer_kvk" style="flex: 1;">
                        <button type="button" id="kvk_search_button" style="flex-shrink: 0;">Zoek bedrijf</button>
                    </div>
                    <div id="kvk_search_results" style="margin-top: 10px; display: none;"></div>
                </div>
                <div class="evc-form-group">
                    <label for="employer_name">Bedrijfsnaam</label>
                    <input type="text" id="employer_name" name="employer_name">
                </div>

                <div class="evc-form-group">
                    <label for="employer_contact_name">Contactpersoon</label>
                    <input type="text" id="employer_contact_name" name="employer_contact_name">
                </div>

                <div class="evc-form-group">
                    <label for="employer_contact_email">E-mail contactpersoon</label>
                    <input type="email" id="employer_contact_email" name="employer_contact_email">
                </div>

                <div class="evc-form-group">
                    <label for="employer_street_address">Adres werkgever</label>
                    <input type="text" id="employer_street_address" name="employer_street_address">
                </div>

                <div class="evc-form-group">
                    <label for="employer_postal_code">Postcode werkgever</label>
                    <input type="text" id="employer_postal_code" name="employer_postal_code">
                </div>

                <div class="evc-form-group">
                    <label for="employer_city">Plaats werkgever</label>
                    <input type="text" id="employer_city" name="employer_city">
                </div>

                <!-- Bestandsupload -->
                <h3>Bestandsupload (optioneel)</h3>
                <div class="evc-form-group evc-file-upload">
                    <label class="evc-file-upload-label" for="file_upload">Bestand uploaden</label>
                    <input type="file" id="file_upload" name="file_upload" multiple>
                    <div class="evc-file-list"></div>
                    <div class="evc-upload-progress">
                        <div class="evc-upload-progress-bar"></div>
                    </div>
                </div>

                <button type="submit">Registreren</button>
            </form>
        `;

        // Setup afhankelijke dropdowns
        this.setupTrajectorySelects();
        this.setupFileUpload();
    }

    setupEventListeners() {
        const form = this.container.querySelector('#evc-registration-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                
                // Valideer form data
                this.validateForm(data);
                
                // Submit naar API
                await this.submitRegistration(data);
                
            } catch (error) {
                if (error.name === 'ValidationError') {
                    this.config.onValidationError(error);
                } else {
                    this.config.onError(error);
                }
            }
        });

        // KVK zoekknop event listener
        const kvkSearchButton = this.container.querySelector('#kvk_search_button');
        if (kvkSearchButton) {
            kvkSearchButton.addEventListener('click', async () => {
                const kvkNumber = this.container.querySelector('#employer_kvk').value.trim();
                if (!kvkNumber) {
                    this.showError('Vul een KVK-nummer in om te zoeken');
                    return;
                }
                
                try {
                    kvkSearchButton.disabled = true;
                    kvkSearchButton.textContent = 'Zoeken...';
                    
                    const companyData = await this.searchKvkData(kvkNumber);
                    if (companyData) {
                        this.fillEmployerData(companyData);
                        this.showSuccess('Bedrijfsgegevens succesvol opgehaald');
                    }
                } catch (error) {
                    this.showError('Fout bij ophalen bedrijfsgegevens: ' + error.message);
                } finally {
                    kvkSearchButton.disabled = false;
                    kvkSearchButton.textContent = 'Zoek bedrijf';
                }
            });
        }
    }

    async submitRegistration(formData) {
        try {
            // Uitschakelen van de submit knop tijdens verwerking
            const submitButton = this.container.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Bezig met verwerken...';
            
            // Toon voortgangsbalk container
            const progressContainer = this.container.querySelector('.evc-upload-progress');
            const progressBar = this.container.querySelector('.evc-upload-progress-bar');
            progressContainer.style.display = 'block';
            progressBar.style.width = '10%'; // Start met 10%
            
            // Frontend validatie
            const validationErrors = this.validateForm(formData);
            if (validationErrors.length > 0) {
                this.showError(validationErrors.join('<br>'));
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
                progressContainer.style.display = 'none';
                return;
            }

            // Haal geselecteerde container en traject op
            const selectedContainer = this.containers.find(
                c => c.id === parseInt(formData.container_id)
            );
            const selectedTrajectory = selectedContainer?.trajectories?.find(
                t => t.id === parseInt(formData.trajectory_id)
            );

            if (!selectedContainer || !selectedTrajectory) {
                throw new Error('Selecteer een richting en traject');
            }

            const data = {
                ...formData,
                provider_id: this.providerId,
                provider_name: this.providerName,
                evc_direction: selectedContainer.name,
                evc_trajectory: selectedTrajectory.name
            };

            if (this.config.debug) {
                console.log('Data naar backend:', data);
            }
            
            // Update voortgangsbalk
            progressBar.style.width = '30%';

            const response = await fetch(`${this.config.apiUrl}/api/register_candidate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.config.embedToken}`
                },
                body: JSON.stringify(data)
            });

            // Check voor HTML response (wat wijst op een error page)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                throw new Error('Server error: Ongeldige response ontvangen');
            }

            const responseData = await response.json();

            if (!response.ok) {
                this.showError(responseData.error || 'Er is iets misgegaan bij de registratie');
                throw new Error(responseData.error || 'Registratie mislukt');
            }
            
            // Update voortgangsbalk
            progressBar.style.width = '50%';

            // Upload bestanden en koppel aan registratie
            const fileInput = this.container.querySelector('#file_upload');
            const files = fileInput.files;

            if (files.length > 0) {
                // Controleer bestandsgrootte en type voor alle bestanden
                const maxFileSize = 10 * 1024 * 1024; // 10 MB
                const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    
                    // Controleer bestandsgrootte
                    if (file.size > maxFileSize) {
                        throw new Error(`Bestand ${file.name} is te groot. Maximale grootte is 10 MB.`);
                    }
                    
                    // Controleer bestandstype
                    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
                    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                        throw new Error(`Bestand ${file.name} heeft een ongeldig type. Toegestane types zijn: PDF, JPG, PNG, DOC, DOCX.`);
                    }
                }
                
                const registrationToken = responseData.registration_token;
                const totalFiles = files.length;
                const progressPerFile = 40 / totalFiles; // 40% van de voortgang is voor bestanden (van 50% naar 90%)
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('registration_token', registrationToken);
                    formData.append('document_type', 'registration_document');
                    
                    try {
                        // Update status tekst
                        submitButton.textContent = `Bestand uploaden (${i+1}/${totalFiles}): ${file.name}`;
                        
                        const uploadResponse = await fetch(`${this.config.apiUrl}/api/upload_pending_document`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.config.embedToken}`
                            },
                            body: formData
                        });
                        
                        const uploadData = await uploadResponse.json();
                        
                        if (!uploadResponse.ok) {
                            console.error('Fout bij uploaden bestand:', uploadData.error);
                        } else if (this.config.debug) {
                            console.log('Bestand geüpload:', uploadData);
                        }
                        
                        // Update voortgangsbalk
                        progressBar.style.width = `${50 + (i+1) * progressPerFile}%`;
                        
                    } catch (uploadError) {
                        console.error('Fout bij uploaden bestand:', uploadError);
                    }
                }
            }
            
            // Update voortgangsbalk naar 100%
            progressBar.style.width = '100%';

            // Toon success message
            this.showSuccess('Je registratie is succesvol ontvangen! We nemen zo spoedig mogelijk contact met je op.');
            
            // Reset form
            this.container.querySelector('.evc-form').reset();
            this.container.querySelector('.evc-file-list').innerHTML = '';
            
            // Reset knop en voortgangsbalk na korte vertraging
            setTimeout(() => {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
            }, 2000);

            this.config.onSuccess(responseData);
            return responseData;

        } catch (error) {
            console.error('Registratie fout:', error);
            this.showError(error.message || 'Er is iets misgegaan bij de registratie');
            
            // Reset knop bij fout
            const submitButton = this.container.querySelector('button[type="submit"]');
            submitButton.disabled = false;
            submitButton.textContent = 'Registreren';
            
            // Verberg voortgangsbalk
            const progressContainer = this.container.querySelector('.evc-upload-progress');
            progressContainer.style.display = 'none';
            
            this.config.onError(error);
            throw error;
        }
    }

    // Validatie functie
    validateForm(formData) {
        const errors = [];

        // Verplichte velden check
        const requiredFields = {
            'title': 'Aanhef',
            'first_name': 'Voornaam',
            'last_name': 'Achternaam',
            'email': 'E-mail',
            'street_address': 'Straat + huisnummer',
            'postal_code': 'Postcode',
            'city': 'Plaats',
            'phone_number': 'Telefoonnummer',
            'date_of_birth': 'Geboortedatum',
            'place_of_birth': 'Geboorteplaats',
            'social_security_number': 'BSN',
            'container_id': 'EVC Richting',
            'trajectory_id': 'EVC Traject',
            'relevant_diplomas': 'Relevante diploma\'s',
            'has_experience': 'Werkervaring'
        };

        Object.entries(requiredFields).forEach(([field, label]) => {
            if (!formData[field]) {
                errors.push(`${label} is verplicht`);
            }
        });

        // Email validatie
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (formData.email && !emailRegex.test(formData.email)) {
            errors.push('Ongeldig e-mailadres');
        }

        // Postcode validatie (Nederlands formaat)
        const postcodeRegex = /^[1-9][0-9]{3}\s?[A-Z]{2}$/i;
        if (formData.postal_code && !postcodeRegex.test(formData.postal_code)) {
            errors.push('Ongeldige postcode (gebruik format: 1234 AB)');
        }

        // Telefoonnummer validatie
        const phoneRegex = /^(((0)[1-9]{2}[0-9][-]?[1-9][0-9]{5})|((\\+31|0|0031)[1-9][0-9][-]?[1-9][0-9]{6}))$/;
        if (formData.phone_number && !phoneRegex.test(formData.phone_number.replace(/\s/g, ''))) {
            errors.push('Ongeldig telefoonnummer');
        }

        // BSN validatie (11-proef)
        const bsnError = this.validateBSN(formData.social_security_number);
        if (bsnError) {
            errors.push(bsnError);
        }

        // Geboortedatum validatie
        if (formData.date_of_birth) {
            const birthDate = new Date(formData.date_of_birth);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            
            if (birthDate > today) {
                errors.push('Geboortedatum kan niet in de toekomst liggen');
            }
            if (age < 16) {
                errors.push('Je moet minimaal 16 jaar oud zijn');
            }
        }

        return errors;
    }

    // BSN validatie functie
    validateBSN(bsn) {
        // Check lengte en alleen cijfers
        if (!/^\d{9}$/.test(bsn)) {
            return 'BSN moet 9 cijfers bevatten';
        }

        // 11-proef
        let sum = 0;
        for (let i = 0; i < 8; i++) {
            sum += (9 - i) * parseInt(bsn[i]);
        }
        sum -= parseInt(bsn[8]);
        
        if (sum % 11 !== 0) {
            return 'Ongeldig BSN nummer (voldoet niet aan de 11-proef)';
        }

        return null; // geen error
    }

    setupTrajectorySelects() {
        const containerSelect = this.container.querySelector('#container_id');
        const trajectorySelect = this.container.querySelector('#trajectory_id');
        const trajectoryGroup = this.container.querySelector('#trajectory_group');

        // Verwijder required bij initialisatie
        trajectorySelect.removeAttribute('required');

        // Event listener voor container wijziging
        containerSelect.addEventListener('change', () => {
            const selectedContainer = this.containers.find(
                c => c.id === parseInt(containerSelect.value)
            );

            if (selectedContainer) {
                // Toon trajectory select
                trajectoryGroup.style.display = 'block';
                trajectorySelect.setAttribute('required', 'required');
                
                // Reset en vul trajectory select
                trajectorySelect.innerHTML = '<option value="">Selecteer een traject</option>';
                selectedContainer.trajectories.forEach(trajectory => {
                    const option = document.createElement('option');
                    option.value = trajectory.id;
                    option.textContent = trajectory.name;
                    trajectorySelect.appendChild(option);
                });
            } else {
                // Verberg trajectory select als geen container geselecteerd
                trajectoryGroup.style.display = 'none';
                trajectorySelect.removeAttribute('required');
            }
        });
    }

    setupFileUpload() {
        const fileInput = this.container.querySelector('#file_upload');
        const fileList = this.container.querySelector('.evc-file-list');
        const uploadProgress = this.container.querySelector('.evc-upload-progress-bar');

        fileInput.addEventListener('change', () => {
            const files = Array.from(fileInput.files);
            fileList.innerHTML = '';

            files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'evc-file-item';
                fileItem.innerHTML = `
                    <span>${file.name}</span>
                    <button class="evc-file-remove">Verwijderen</button>
                `;
                fileList.appendChild(fileItem);

                const removeButton = fileItem.querySelector('.evc-file-remove');
                removeButton.addEventListener('click', () => {
                    // We kunnen files niet direct aanpassen omdat het een FileList is
                    // In plaats daarvan maken we een nieuwe DataTransfer en verwijderen het bestand
                    const dt = new DataTransfer();
                    Array.from(fileInput.files)
                        .filter(f => f !== file)
                        .forEach(f => dt.items.add(f));
                    
                    fileInput.files = dt.files;
                    fileItem.remove();
                });
            });
        });
    }

    // Standaard callbacks
    defaultSuccess(data) {
        console.log('Registratie succesvol:', data);
    }

    defaultError(error) {
        console.error('Registratie fout:', error);
    }

    defaultValidationError(error) {
        console.error('Validatie fout:', error);
    }

    async validateHostDomain(domain) {
        try {
            // Skip validatie voor localhost/development
            if (domain === 'localhost' || domain === '127.0.0.1') {
                console.log('Development mode - domain validatie overgeslagen');
                return true;
            }

            // Debug logging
            console.log('Valideren website domein:', domain);

            const response = await fetch(`${this.config.apiUrl}/api/providers/${this.providerId}/validate-domain`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.embedToken}`
                },
                body: JSON.stringify({ domain: domain })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Deze website is niet geautoriseerd om het registratieformulier te tonen');
            }

            return true;
        } catch (error) {
            console.error('Domein validatie fout:', error);
            throw new Error('Deze website is niet geautoriseerd om het registratieformulier te tonen. ' +
                           'Neem contact op met de EVC-aanbieder.');
        }
    }

    defaultLoad(data) {
        console.log('Trajecten geladen:', data);
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'evc-error';
        errorDiv.innerHTML = `
            <strong>Er ging iets mis:</strong>
            <p>${message}</p>
        `;
        
        // Verwijder bestaande error messages
        const existingErrors = this.container.querySelectorAll('.evc-error');
        existingErrors.forEach(el => el.remove());
        
        // Voeg nieuwe error toe bovenaan het formulier
        const form = this.container.querySelector('.evc-form');
        form.insertBefore(errorDiv, form.firstChild);
    }

    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'evc-success';
        successDiv.innerHTML = `
            <strong>Succes!</strong>
            <p>${message}</p>
        `;
        
        // Verwijder bestaande messages
        const existingMessages = this.container.querySelectorAll('.evc-success, .evc-error');
        existingMessages.forEach(el => el.remove());
        
        // Voeg success message toe
        const form = this.container.querySelector('.evc-form');
        form.insertBefore(successDiv, form.firstChild);
    }

    async searchKvkData(kvkNumber) {
        try {
            // Gebruik de KVK API om bedrijfsgegevens op te halen
            // In de testomgeving gebruiken we de test API key
            const apiKey = 'l7xx1f2691f2520d487b902f4e0b57a0b197'; // Test API key
            
            // Eerst zoeken we het bedrijf op basis van KVK-nummer
            const searchUrl = `https://api.kvk.nl/test/api/v1/basisprofielen/${kvkNumber}`;
            
            const response = await fetch(searchUrl, {
                method: 'GET',
                headers: {
                    'apikey': apiKey,
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Geen bedrijf gevonden met dit KVK-nummer');
                } else {
                    throw new Error(`Fout bij ophalen bedrijfsgegevens: ${response.status}`);
                }
            }
            
            const data = await response.json();
            
            if (this.config.debug) {
                console.log('KVK data opgehaald:', data);
            }
            
            return data;
        } catch (error) {
            console.error('Fout bij ophalen KVK data:', error);
            throw error;
        }
    }
    
    fillEmployerData(companyData) {
        try {
            // Vul de werkgevergegevens in op basis van de opgehaalde KVK-gegevens
            const employerNameField = this.container.querySelector('#employer_name');
            const employerStreetField = this.container.querySelector('#employer_street_address');
            const employerPostalCodeField = this.container.querySelector('#employer_postal_code');
            const employerCityField = this.container.querySelector('#employer_city');
            
            // Haal de relevante gegevens uit de KVK-data
            if (companyData.eigenaar && companyData.eigenaar.naam) {
                employerNameField.value = companyData.eigenaar.naam.volledigeNaam || '';
            } else if (companyData.naam) {
                employerNameField.value = companyData.naam || '';
            }
            
            // Adresgegevens uit hoofdvestiging of eerste vestiging
            const vestiging = companyData.hoofdvestiging || (companyData.vestigingen && companyData.vestigingen[0]);
            
            if (vestiging && vestiging.adressen && vestiging.adressen.length > 0) {
                const adres = vestiging.adressen[0];
                
                // Straat en huisnummer
                const straat = adres.straatnaam || '';
                const huisnummer = adres.huisnummer || '';
                const huisnummerToevoeging = adres.huisnummerToevoeging || '';
                employerStreetField.value = `${straat} ${huisnummer}${huisnummerToevoeging ? ' ' + huisnummerToevoeging : ''}`;
                
                // Postcode
                employerPostalCodeField.value = adres.postcode || '';
                
                // Plaats
                employerCityField.value = adres.plaats || '';
            }
            
            // Toon de resultaten
            const resultsDiv = this.container.querySelector('#kvk_search_results');
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="evc-success" style="margin-bottom: 10px;">
                        <strong>Bedrijfsgegevens gevonden:</strong><br>
                        ${employerNameField.value}<br>
                        ${employerStreetField.value}<br>
                        ${employerPostalCodeField.value} ${employerCityField.value}
                    </div>
                `;
                resultsDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Fout bij invullen werkgevergegevens:', error);
            throw error;
        }
    }
}

// Maak beschikbaar voor verschillende module systemen
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVCRegistration;
} else if (typeof define === 'function' && define.amd) {
    define([], function() { return EVCRegistration; });
} else {
    window.EVCRegistration = EVCRegistration;
} 