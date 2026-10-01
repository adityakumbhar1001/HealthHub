#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <stdexcept>
using namespace std;
/*
    CareSphere C++ OOP Core
*/
// Abstract/Base class
class Person
{
protected:
    int id;
    string name;
    int age;

public:

    // Default Constructor
    Person()
    {
        id = 0;
        name = "";
        age = 0;
    }

    // Parameterized Constructor
    Person(int i, string n, int a)
    {
        id = i;
        name = n;
        age = a;
    }

    virtual void display() const
    {
        cout << "ID: " << id << endl;
        cout << "Name: " << name << endl;
        cout << "Age: " << age << endl;
    }

    virtual ~Person()
    {
        cout << "Person destructor called" << endl;
    }

    int getId() const
    {
        return id;
    }

    string getName() const
    {
        return name;
    }
};


// Patient class inherits Person
class Patient : public Person
{
private:
    string disease;
    string bloodGroup;

    static int patientCount;

public:

    // Default Constructor
    Patient() : Person()
    {
        disease = "";
        bloodGroup = "";
        patientCount++;
    }

    // Parameterized Constructor
    Patient(int i, string n, int a, string d, string bg)
        : Person(i, n, a)
    {
        disease = d;
        bloodGroup = bg;
        patientCount++;
    }

    void display() const
    {
        Person::display();

        cout << "Disease: " << disease << endl;
        cout << "Blood Group: " << bloodGroup << endl;
    }

    static int getPatientCount()
    {
        return patientCount;
    }

    // Friend Function
    friend void showPatientBasicData(const Patient& p);

    ~Patient()
    {
        cout << "Patient destructor called" << endl;
    }
};


// Definition of static variable
int Patient::patientCount = 0;


// Friend Function
void showPatientBasicData(const Patient& p)
{
    cout << "Patient ID: " << p.id << endl;
    cout << "Patient Name: " << p.name << endl;
}


// Doctor class inherits Person
class Doctor : public Person
{
private:
    string specialization;
    int experience;

    static int doctorCount;

public:

    // Default Constructor
    Doctor() : Person()
    {
        specialization = "";
        experience = 0;
        doctorCount++;
    }

    // Parameterized Constructor
    Doctor(int i, string n, int a, string s, int e)
        : Person(i, n, a)
    {
        specialization = s;
        experience = e;
        doctorCount++;
    }

    void display() const
    {
        Person::display();

        cout << "Specialization: " << specialization << endl;
        cout << "Experience: " << experience << " years" << endl;
    }

    static int getDoctorCount()
    {
        return doctorCount;
    }

    ~Doctor()
    {
        cout << "Doctor destructor called" << endl;
    }
};


// Definition of static variable
int Doctor::doctorCount = 0;


// Appointment class
class Appointment
{
private:
    int appointmentId;
    int patientId;
    int doctorId;

    string date;
    string time;
    string reason;

public:

    // Default Constructor
    Appointment()
    {
        appointmentId = 0;
        patientId = 0;
        doctorId = 0;
        date = "";
        time = "";
        reason = "";
    }

    // Parameterized Constructor
    Appointment(int a, int p, int d,
                string dt, string t, string r)
    {
        appointmentId = a;
        patientId = p;
        doctorId = d;
        date = dt;
        time = t;
        reason = r;
    }

    void display() const
    {
        cout << "Appointment ID: " << appointmentId << endl;
        cout << "Patient ID: " << patientId << endl;
        cout << "Doctor ID: " << doctorId << endl;
        cout << "Date: " << date << endl;
        cout << "Time: " << time << endl;
        cout << "Reason: " << reason << endl;
    }
};


// EmergencyCase class
class EmergencyCase
{
private:
    int caseId;
    string patientName;
    string condition;
    int priority;

public:

    // Parameterized Constructor
    EmergencyCase(int i, string n, string c, int p)
    {
        caseId = i;
        patientName = n;
        condition = c;
        priority = p;
    }

    // Operator Overloading
    bool operator<(const EmergencyCase& other) const
    {
        return priority < other.priority;
    }

    void display() const
    {
        cout << "Case ID: " << caseId << " | Patient: " << patientName << " | Priority: " << priority   << " | Condition: " << condition << endl;
    }
};


// Medicine class
class Medicine
{
private:
    int medicineId;
    string name;
    int quantity;
    double price;

public:

    // Parameterized Constructor
    Medicine(int i, string n, int q, double p)
    {
        medicineId = i;
        name = n;
        quantity = q;
        price = p;
    }

    void addStock(int amount)
    {
        if (amount < 0)
        {
            throw invalid_argument("Stock cannot be negative.");
        }

        quantity = quantity + amount;
    }

    bool lowStock() const
    {
        return quantity < 10;
    }

    void display() const
    {
        cout << medicineId << " | "<< name << " | Quantity: "<< quantity << " | Price: "<< price;

        if (lowStock())
        {
            cout << " | LOW STOCK";
        }

        cout << endl;
    }
};


// Bill class
class Bill
{
private:
    double consultationFee;
    double medicineFee;
    double labFee;

public:

    // Parameterized Constructor with default values
    Bill(double c = 0, double m = 0, double l = 0)
    {
        consultationFee = c;
        medicineFee = m;
        labFee = l;
    }

    double calculateTotal() const
    {
        return consultationFee + medicineFee + labFee;
    }

    void display() const
    {
        cout << "Consultation: " << consultationFee << endl;
        cout << "Medicine: " << medicineFee << endl;
        cout << "Laboratory: " << labFee << endl;
        cout << "Total: " << calculateTotal() << endl;
    }
};


// Template Function
template <class T>
void showValue(T value)
{
    cout << "Value: " << value << endl;
}


// Hospital class
class Hospital
{
private:
    vector<Patient> patients;
    vector<Doctor> doctors;
    vector<Appointment> appointments;
    vector<EmergencyCase> emergencies;
    vector<Medicine> medicines;

public:

    void addPatient(const Patient& p)
    {
        patients.push_back(p);
    }

    void addDoctor(const Doctor& d)
    {
        doctors.push_back(d);
    }

    void addAppointment(const Appointment& a)
    {
        appointments.push_back(a);
    }

    void addEmergency(const EmergencyCase& e)
    {
        emergencies.push_back(e);
    }

    void addMedicine(const Medicine& m)
    {
        medicines.push_back(m);
    }

    void displayPatients() const
    {
        cout << endl;
        cout << "--- Patients ---" << endl;

        for (const Patient& p : patients)
        {
            p.display();
        }
    }

    void displayDoctors() const
    {
        cout << endl;
        cout << "--- Doctors ---" << endl;

        for (const Doctor& d : doctors)
        {
            d.display();
        }
    }

    void displayEmergencies() const
    {
        cout << endl;
        cout << "--- Emergency Cases ---" << endl;

        for (const EmergencyCase& e : emergencies)
        {
            e.display();
        }
    }

    void displayMedicines() const
    {
        cout << endl;
        cout << "--- Medicines ---" << endl;

        for (const Medicine& m : medicines)
        {
            m.display();
        }
    }

    void savePatientsToFile() const
    {
        ofstream file("patients.txt");

        if (!file)
        {
            throw runtime_error("Unable to open patients.txt");
        }

        for (const Patient& p : patients)
        {
            file << p.getId() << " "
                 << p.getName() << endl;
        }

        file.close();

        cout << "Patient data saved successfully." << endl;
    }

    void searchPatient(int patientId) const
    {
        for (const Patient& p : patients)
        {
            if (p.getId() == patientId)
            {
                cout << endl;
                cout << "Patient found:" << endl;

                p.display();

                return;
            }
        }
        cout << "Patient not found." << endl;
    }
};

// Main Function
int main()
{
    try
    {
        Hospital hospital;

        // Creating Patient objects
        Patient p1(101, "Rahul", 25, "Fever", "B+");
        Patient p2(102, "Priya", 32, "Diabetes", "O+");

        // Creating Doctor objects
        Doctor d1(201, "Amit", 45, "Cardiology", 10);
        Doctor d2(202, "Neha", 38, "General Medicine", 6);

        // Adding patients
        hospital.addPatient(p1);
        hospital.addPatient(p2);

        // Adding doctors
        hospital.addDoctor(d1);
        hospital.addDoctor(d2);

        // Adding appointment
        hospital.addAppointment
        (
            Appointment(1, 101, 202,"2026-09-10", "10:30","Fever")
        );

        // Adding emergency cases
        hospital.addEmergency
        (
            EmergencyCase(1,"Rahul","Breathing problem",1)
        );

        hospital.addEmergency(
            EmergencyCase(2,"Priya","High sugar",2)
        );

        // Adding medicines
        hospital.addMedicine(
            Medicine(1,"Paracetamol",100,5.0)
        );

        hospital.addMedicine(
            Medicine(2,"Insulin",8, 350.0)
        );

        // Display data
        hospital.displayPatients();

        hospital.displayDoctors();

        hospital.displayEmergencies();

        hospital.displayMedicines();

        // Search patient
        hospital.searchPatient(101);

        // Bill
        Bill bill(500, 150, 250);

        cout << endl;
        cout << "--- Bill ---" << endl;

        bill.display();

        // Static members
        cout << endl;
        cout << "Static Patient Count: "<< Patient::getPatientCount() << endl;

        cout << "Static Doctor Count: "<< Doctor::getDoctorCount() << endl;

        // Friend Function
        cout << endl;
        cout << "Friend Function Example:" << endl;

        showPatientBasicData(p1);

        // Template
        cout << endl;
        cout << "Template Example:" << endl;

        showValue(100);

        showValue(string("CareSphere"));

        // File Handling
        cout << endl;
        cout << "File Handling:" << endl;

        hospital.savePatientsToFile();

        // Dynamic Allocation
        Patient* dynamicPatient = new Patient(103,"Aman",28,"Cold","A+");

        cout << endl;
        cout << "Dynamically created patient:" << endl;

        dynamicPatient->display();

        delete dynamicPatient;
    }

    catch (const exception& e)
    {
        cout << "Error: " << e.what() << endl;
    }

    return 0;
}