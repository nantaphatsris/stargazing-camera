using System;
class Program {
    
  static void Main() {
      
    Console.Write("Enter number of guests: ");
    int N = int.Parse(Console.ReadLine());
    
    //คำนวณจำนวนห้อง
    int room = N / 4;
    
    //คำนวณจำนวนคนที่เกินมาจากที่หาร 4 ลงตัว
    int extra = N % 4;
    
    int cost;
    switch (extra) {
        
            
        case 1:
            cost = (room * 1200) + 500;
            break;
            
        case 2:
            cost = (room * 1200) + 800;
            break;
            
        case 3:
            cost = (room * 1200) + 1000;
            break;
            
        default:
            cost = 0;
            break;
    }
    
    Console.WriteLine("Total cost = " + cost + "Baht");
    
  }
}
