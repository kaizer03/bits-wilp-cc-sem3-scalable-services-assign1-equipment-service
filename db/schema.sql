CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  description VARCHAR(400) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'maintenance')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO equipment(id,asset_tag,name,category,location,description,status) VALUES
('58300000-0000-4000-8000-000000000001','PRJ-001','Epson EB-E01 Projector','Presentation','Main building · Store room','Portable projector with HDMI cable and carry case.','operational'),
('58300000-0000-4000-8000-000000000002','CAM-001','Canon EOS 200D Camera','Photography','Media room','Camera body, standard lens and battery charger.','operational'),
('58300000-0000-4000-8000-000000000003','AUD-001','JBL Portable Speaker','Audio','Main building · Store room','Portable speaker with microphone input.','operational'),
('58300000-0000-4000-8000-000000000004','PRJ-002','BenQ Meeting Room Projector','Presentation','Conference room','Awaiting lamp replacement.','maintenance'),
('58300000-0000-4000-8000-000000000005','CON-001','Logitech Conference Camera','Conferencing','IT support desk','USB conference camera for meetings and seminars.','operational')
ON CONFLICT DO NOTHING;
